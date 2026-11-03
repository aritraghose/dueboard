/// <reference types="@cloudflare/workers-types" />

// Tibo's thread in the Durable Object's SQLite (architecture.md §7.2). One
// thread per user, kept forever: a user message is one row, and each of
// Tibo's bubbles is its own row sharing the turn's `turn_id`.
//
// `messages_fts` is an FTS5 index over `body`, kept in sync by triggers, for
// step 19's `search_conversation`. `seq` orders the thread and is the FTS
// rowid; `id` is the stable public id.

import {
  TIBO_QUOTE_LENGTH,
  type TiboConfirm,
  type TiboMessage,
  type TiboQuote,
  type TiboReceipt,
  type TiboRole,
} from "./protocol.ts";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  turn_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'tibo', 'system_event')),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  meta TEXT
);
CREATE INDEX IF NOT EXISTS messages_turn_idx ON messages (turn_id);
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  body, content = 'messages', content_rowid = 'seq', tokenize = 'porter unicode61'
);
CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts (rowid, body) VALUES (new.seq, new.body);
END;
CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts (messages_fts, rowid, body) VALUES ('delete', old.seq, old.body);
END;
CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE OF body ON messages BEGIN
  INSERT INTO messages_fts (messages_fts, rowid, body) VALUES ('delete', old.seq, old.body);
  INSERT INTO messages_fts (rowid, body) VALUES (new.seq, new.body);
END;
`;

/** Free-form facts about a row, stored as JSON (`clientId`; later the model, a relay id…). */
export type MessageMeta = {
  readonly clientId?: string;
  readonly reaction?: string;
  readonly seen?: boolean;
  readonly replyTo?: TiboQuote;
  readonly receipts?: readonly TiboReceipt[];
  readonly confirm?: TiboConfirm;
} & Record<string, unknown>;

type Row = {
  seq: number;
  id: string;
  turn_id: string;
  role: TiboRole;
  body: string;
  created_at: number;
  meta: string | null;
};

const toMessage = (row: Row): TiboMessage => {
  const meta = row.meta ? (JSON.parse(row.meta) as MessageMeta) : {};
  return {
    id: row.id,
    turnId: row.turn_id,
    role: row.role,
    body: row.body,
    createdAt: row.created_at,
    ...(typeof meta.clientId === "string" ? { clientId: meta.clientId } : {}),
    ...(typeof meta.reaction === "string" ? { reaction: meta.reaction } : {}),
    ...(meta.seen === true ? { seen: true } : {}),
    ...(meta.replyTo ? { replyTo: meta.replyTo } : {}),
    ...(Array.isArray(meta.receipts) && meta.receipts.length > 0 ? { receipts: meta.receipts } : {}),
    ...(meta.confirm ? { confirm: meta.confirm } : {}),
  };
};

export class Thread {
  constructor(private readonly sql: SqlStorage) {}

  /** Creates the tables if they're missing. Safe to run on every start. */
  migrate() {
    this.sql.exec(SCHEMA);
  }

  add(input: {
    role: TiboRole;
    body: string;
    turnId?: string;
    meta?: MessageMeta;
    id?: string;
  }): TiboMessage {
    const id = input.id ?? crypto.randomUUID();
    const row = this.sql
      .exec<Row>(
        `INSERT INTO messages (id, turn_id, role, body, created_at, meta)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
        id,
        input.turnId ?? id,
        input.role,
        input.body,
        Date.now(),
        input.meta ? JSON.stringify(input.meta) : null,
      )
      .one();
    return toMessage(row);
  }

  /** The newest `limit` messages, oldest first, and whether older ones exist. */
  latest(limit: number) {
    return this.page(
      this.sql.exec<Row>(`SELECT * FROM messages ORDER BY seq DESC LIMIT ?`, limit + 1).toArray(),
      limit,
    );
  }

  /** Up to `limit` messages before `beforeId`, oldest first. Unknown ids give an empty page. */
  before(beforeId: string, limit: number) {
    return this.page(
      this.sql
        .exec<Row>(
          `SELECT * FROM messages
           WHERE seq < (SELECT seq FROM messages WHERE id = ?)
           ORDER BY seq DESC LIMIT ?`,
          beforeId,
          limit + 1,
        )
        .toArray(),
      limit,
    );
  }

  get(id: string): TiboMessage | null {
    const row = this.sql.exec<Row>(`SELECT * FROM messages WHERE id = ?`, id).toArray()[0];
    return row ? toMessage(row) : null;
  }

  /** A message as a reply quotes it (the start of its text). */
  quote(id: string): TiboQuote | null {
    const message = this.get(id);
    if (!message || message.role === "system_event") return null;
    const body =
      message.body.length > TIBO_QUOTE_LENGTH ? `${message.body.slice(0, TIBO_QUOTE_LENGTH - 1)}…` : message.body;
    return { id: message.id, role: message.role, body };
  }

  /**
   * Sets the reaction on a message of `role` (replacing any earlier one;
   * `null` removes it). `null` if there's no such message.
   */
  react(id: string, role: TiboRole, emoji: string | null): TiboMessage | null {
    const row = this.sql
      .exec<Row>(
        emoji === null
          ? `UPDATE messages SET meta = json_remove(coalesce(meta, '{}'), '$.reaction')
             WHERE id = ? AND role = ? RETURNING *`
          : `UPDATE messages SET meta = json_set(coalesce(meta, '{}'), '$.reaction', ?)
             WHERE id = ? AND role = ? RETURNING *`,
        ...(emoji === null ? [id, role] : [emoji, id, role]),
      )
      .toArray()[0];
    return row ? toMessage(row) : null;
  }

  /** Sets one meta key on a message (JSON value); `null` if there's no such message. */
  setMeta(id: string, key: "receipts" | "confirm", value: unknown): TiboMessage | null {
    const row = this.sql
      .exec<Row>(
        `UPDATE messages SET meta = json_set(coalesce(meta, '{}'), '$.' || ?, json(?))
         WHERE id = ? RETURNING *`,
        key,
        JSON.stringify(value),
        id,
      )
      .toArray()[0];
    return row ? toMessage(row) : null;
  }

  /** The order of the newest row (0 for an empty thread). */
  lastSeq(): number {
    return this.sql.exec<{ seq: number | null }>(`SELECT max(seq) AS seq FROM messages`).one().seq ?? 0;
  }

  /** The order of the newest message the user wrote (0 if none). */
  lastUserSeq(): number {
    return (
      this.sql.exec<{ seq: number | null }>(`SELECT max(seq) AS seq FROM messages WHERE role = 'user'`).one().seq ?? 0
    );
  }

  /** Marks every unread user message as seen; returns their ids. */
  markSeen(): string[] {
    return this.sql
      .exec<{ id: string }>(
        `UPDATE messages SET meta = json_set(coalesce(meta, '{}'), '$.seen', json('true'))
         WHERE role = 'user' AND json_extract(coalesce(meta, '{}'), '$.seen') IS NULL
         RETURNING id`,
      )
      .toArray()
      .map((row) => row.id);
  }

  /** Whether the user wrote after Tibo's last bubble: a turn is owed. */
  awaitingReply(): boolean {
    const last = this.sql
      .exec<{ role: TiboRole }>(`SELECT role FROM messages WHERE role != 'system_event' ORDER BY seq DESC LIMIT 1`)
      .toArray()[0];
    return last?.role === "user";
  }

  /**
   * Keyword search over every message, newest first (FTS5 syntax). For step
   * 19's `search_conversation`; unused until then.
   */
  search(query: string, limit: number): TiboMessage[] {
    return this.sql
      .exec<Row>(
        `SELECT m.* FROM messages_fts f JOIN messages m ON m.seq = f.rowid
         WHERE messages_fts MATCH ? ORDER BY m.seq DESC LIMIT ?`,
        query,
        limit,
      )
      .toArray()
      .map(toMessage);
  }

  private page(rows: Row[], limit: number) {
    return {
      messages: rows.slice(0, limit).reverse().map(toMessage),
      hasMore: rows.length > limit,
    };
  }
}

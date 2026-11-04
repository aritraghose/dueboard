/// <reference types="@cloudflare/workers-types" />

import {
  TIBO_QUOTE_LENGTH,
  type TiboAttachment,
  type TiboConfirm,
  type TiboMessage,
  type TiboQuote,
  type TiboReceipt,
  type TiboRelayCard,
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

export type MessageMeta = {
  readonly clientId?: string;
  readonly reaction?: string;
  readonly seen?: boolean;
  readonly replyTo?: TiboQuote;
  readonly receipts?: readonly TiboReceipt[];
  readonly confirm?: TiboConfirm;
  readonly relay?: TiboRelayCard;
  readonly attachments?: readonly TiboAttachment[];
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
    ...(meta.relay ? { relay: meta.relay } : {}),
    ...(Array.isArray(meta.attachments) && meta.attachments.length > 0 ? { attachments: meta.attachments } : {}),
  };
};

export class Thread {
  constructor(private readonly sql: SqlStorage) {}

  migrate() {
    this.sql.exec(SCHEMA);
  }

  add(input: {
    role: TiboRole;
    body: string;
    turnId?: string;
    meta?: MessageMeta;
    id?: string;
    createdAt?: number;
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
        input.createdAt ?? Date.now(),
        input.meta ? JSON.stringify(input.meta) : null,
      )
      .one();
    return toMessage(row);
  }

  latest(limit: number) {
    return this.page(
      this.sql.exec<Row>(`SELECT * FROM messages ORDER BY seq DESC LIMIT ?`, limit + 1).toArray(),
      limit,
    );
  }

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

  quote(id: string): TiboQuote | null {
    const message = this.get(id);
    if (!message || message.role === "system_event") return null;
    const text = message.body || (message.attachments ?? []).map((attachment) => `📎 ${attachment.name}`).join(", ");
    const body = text.length > TIBO_QUOTE_LENGTH ? `${text.slice(0, TIBO_QUOTE_LENGTH - 1)}…` : text;
    return { id: message.id, role: message.role, body };
  }

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

  setMeta(id: string, key: "receipts" | "confirm" | "relay", value: unknown): TiboMessage | null {
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

  lastSeq(): number {
    return this.sql.exec<{ seq: number | null }>(`SELECT max(seq) AS seq FROM messages`).one().seq ?? 0;
  }

  lastUserSeq(): number {
    return (
      this.sql.exec<{ seq: number | null }>(`SELECT max(seq) AS seq FROM messages WHERE role = 'user'`).one().seq ?? 0
    );
  }

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

  lastMessageAt(): number | null {
    return (
      this.sql
        .exec<{ at: number | null }>(`SELECT max(created_at) AS at FROM messages WHERE role != 'system_event'`)
        .one().at ?? null
    );
  }

  tiboAfter(afterSeq: number): boolean {
    return (
      this.sql.exec(`SELECT 1 FROM messages WHERE role = 'tibo' AND seq > ? LIMIT 1`, afterSeq).toArray().length > 0
    );
  }

  remove(id: string) {
    this.sql.exec(`DELETE FROM messages WHERE id = ?`, id);
  }

  awaitingReply(): boolean {
    const last = this.sql
      .exec<{ role: TiboRole }>(`SELECT role FROM messages WHERE role != 'system_event' ORDER BY seq DESC LIMIT 1`)
      .toArray()[0];
    return last?.role === "user";
  }

  after(afterSeq: number, limit: number): (TiboMessage & { readonly seq: number })[] {
    return this.sql
      .exec<Row>(`SELECT * FROM messages WHERE seq > ? ORDER BY seq LIMIT ?`, afterSeq, limit)
      .toArray()
      .map((row) => ({ ...toMessage(row), seq: row.seq }));
  }

  countAfter(afterSeq: number): number {
    return this.sql.exec<{ n: number }>(`SELECT count(*) AS n FROM messages WHERE seq > ?`, afterSeq).one().n;
  }

  search(
    match: string,
    options: { from?: number; to?: number; limit: number },
  ): { id: string; role: TiboRole; createdAt: number; snippet: string }[] {
    return this.sql
      .exec<{ id: string; role: TiboRole; created_at: number; snippet: string }>(
        `SELECT m.id, m.role, m.created_at, snippet(messages_fts, 0, '', '', '…', 24) AS snippet
         FROM messages_fts f JOIN messages m ON m.seq = f.rowid
         WHERE messages_fts MATCH ? AND m.created_at >= ? AND m.created_at < ?
         ORDER BY bm25(messages_fts) LIMIT ?`,
        match,
        options.from ?? 0,
        options.to ?? Number.MAX_SAFE_INTEGER,
        options.limit,
      )
      .toArray()
      .map((row) => ({ id: row.id, role: row.role, createdAt: row.created_at, snippet: row.snippet }));
  }

  clear() {
    this.sql.exec(`DELETE FROM messages`);
  }

  private page(rows: Row[], limit: number) {
    return {
      messages: rows.slice(0, limit).reverse().map(toMessage),
      hasMore: rows.length > limit,
    };
  }
}

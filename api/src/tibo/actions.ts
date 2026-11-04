/// <reference types="@cloudflare/workers-types" />

import type { TiboRpc } from "../domain-client.ts";
import {
  TIBO_CONFIRM_TTL_MS,
  type TiboAttachment,
  type TiboConfirmStatus,
  type TiboItemKind,
  type TiboReceipt,
} from "./protocol.ts";

export const BULK_LIMIT = 3;
export const MAX_TOOL_STEPS = 8;
export const MAX_TOOL_CALLS = 20;

export interface DomainCall {
  readonly rpc: TiboRpc;
  readonly payload: unknown;
  readonly summary: string;
  readonly done: string;
  readonly keys: readonly string[];
  readonly verb: string;
  readonly item?: { readonly kind: TiboItemKind; readonly id?: string; readonly title?: string };
}

export const receiptFor = (call: DomainCall, value: unknown, text: string = call.done): TiboReceipt => {
  const answered = value as { id?: unknown } | null;
  const id = call.item?.id ?? (typeof answered?.id === "string" ? answered.id : undefined);
  return {
    text,
    verb: call.verb,
    ...(call.item && id ? { item: { kind: call.item.kind, id, ...(call.item.title ? { title: call.item.title } : {}) } } : {}),
  };
};

export class TurnLedger {
  readonly receipts: TiboReceipt[] = [];
  readonly held: DomainCall[] = [];
  readonly changed = new Set<string>();
  readonly images: TiboAttachment[] = [];
  mutations = 0;
  toolCalls = 0;

  record(receipt: TiboReceipt, keys: readonly string[]) {
    this.mutations += 1;
    this.receipts.push(receipt);
    for (const key of keys) this.changed.add(key);
  }

  get overBulkLimit() {
    return this.mutations + this.held.length >= BULK_LIMIT;
  }
}

export interface PendingAction {
  readonly id: string;
  readonly messageId: string;
  readonly afterSeq: number;
  readonly calls: readonly DomainCall[];
  readonly status: TiboConfirmStatus;
  readonly expiresAt: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS pending_actions (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  after_seq INTEGER NOT NULL,
  calls TEXT NOT NULL,
  status TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
`;

type Row = {
  id: string;
  message_id: string;
  after_seq: number;
  calls: string;
  status: TiboConfirmStatus;
  expires_at: number;
};

const toAction = (row: Row): PendingAction => ({
  id: row.id,
  messageId: row.message_id,
  afterSeq: row.after_seq,
  calls: JSON.parse(row.calls) as DomainCall[],
  status: row.status,
  expiresAt: row.expires_at,
});

export class PendingActions {
  constructor(private readonly sql: SqlStorage) {}

  migrate() {
    this.sql.exec(SCHEMA);
  }

  hold(input: { messageId: string; afterSeq: number; calls: readonly DomainCall[]; now: number }) {
    const expired = this.sql
      .exec<Row>(`UPDATE pending_actions SET status = 'expired' WHERE status = 'pending' RETURNING *`)
      .toArray()
      .map(toAction);
    const row = this.sql
      .exec<Row>(
        `INSERT INTO pending_actions (id, message_id, after_seq, calls, status, expires_at)
         VALUES (?, ?, ?, ?, 'pending', ?) RETURNING *`,
        crypto.randomUUID(),
        input.messageId,
        input.afterSeq,
        JSON.stringify(input.calls),
        input.now + TIBO_CONFIRM_TTL_MS,
      )
      .one();
    return { action: toAction(row), expired };
  }

  current(now: number): PendingAction | null {
    const row = this.sql
      .exec<Row>(`SELECT * FROM pending_actions WHERE status = 'pending' ORDER BY rowid DESC LIMIT 1`)
      .toArray()[0];
    if (!row) return null;
    return row.expires_at > now ? toAction(row) : null;
  }

  get(id: string): PendingAction | null {
    const row = this.sql.exec<Row>(`SELECT * FROM pending_actions WHERE id = ?`, id).toArray()[0];
    return row ? toAction(row) : null;
  }

  settle(id: string, status: Exclude<TiboConfirmStatus, "pending">): PendingAction | null {
    const row = this.sql
      .exec<Row>(
        `UPDATE pending_actions SET status = ? WHERE id = ? AND status = 'pending' RETURNING *`,
        status,
        id,
      )
      .toArray()[0];
    return row ? toAction(row) : null;
  }
}

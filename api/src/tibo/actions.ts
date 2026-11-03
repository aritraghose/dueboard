/// <reference types="@cloudflare/workers-types" />

// What Tibo does to the user's data during a turn, and the actions it holds
// for their go-ahead (architecture.md §7.4).
//
// Confirmation design: a destructive or surprising call (deleting anything,
// stopping or replacing a running session, more than `BULK_LIMIT` changes in
// one reply, making something public) isn't run. The tool answers
// `needs_confirmation` and the call is held; at the end of the turn the held
// calls become one pending action, stored here and shown as Confirm and
// Cancel buttons on the turn's last bubble (`meta.confirm`). The user
// answers with a tap (the agent runs the stored calls exactly as summarized,
// with no model call and no charge) or in words, through the
// `confirm_action` tool. That tool only works when the turn was started by
// a message the user typed after the action was held, so Tibo can't confirm
// its own request, and text that reached the thread any other way (relayed
// messages, app events) can't confirm anything.

import type { TiboRpc } from "../domain-client.ts";
import {
  TIBO_CONFIRM_TTL_MS,
  type TiboConfirmStatus,
  type TiboItemKind,
  type TiboReceipt,
} from "./protocol.ts";

/** Changes one reply may make before the rest wait for the user. */
export const BULK_LIMIT = 3;
/** Model steps per turn (each step can call several tools). */
export const MAX_TOOL_STEPS = 8;
/** Tool calls per turn, however they're spread over steps. */
export const MAX_TOOL_CALLS = 20;

/** A domain call, ready to run now or later. */
export interface DomainCall {
  readonly rpc: TiboRpc;
  readonly payload: unknown;
  /** What it will do, for the confirm card: "Delete task: Gym". */
  readonly summary: string;
  /** What it did, for the receipt: "Deleted task: Gym". */
  readonly done: string;
  /** Reactivity keys of the lists it changes. */
  readonly keys: readonly string[];
  /** The receipt's word for it: "Created", "Deleted", "Checked in". */
  readonly verb: string;
  /** The item it's about; a create learns its id from the answer. */
  readonly item?: { readonly kind: TiboItemKind; readonly id?: string; readonly title?: string };
}

/** The receipt for a call that went through; `value` is the domain's answer. */
export const receiptFor = (call: DomainCall, value: unknown, text: string = call.done): TiboReceipt => {
  const answered = value as { id?: unknown } | null;
  const id = call.item?.id ?? (typeof answered?.id === "string" ? answered.id : undefined);
  return {
    text,
    verb: call.verb,
    ...(call.item && id ? { item: { kind: call.item.kind, id, ...(call.item.title ? { title: call.item.title } : {}) } } : {}),
  };
};

/** One turn's record of tool use. */
export class TurnLedger {
  readonly receipts: TiboReceipt[] = [];
  readonly held: DomainCall[] = [];
  readonly changed = new Set<string>();
  /** Changes made so far (held ones don't count). */
  mutations = 0;
  toolCalls = 0;

  /** A change went through. */
  record(receipt: TiboReceipt, keys: readonly string[]) {
    this.mutations += 1;
    this.receipts.push(receipt);
    for (const key of keys) this.changed.add(key);
  }

  /** Whether the next change must wait for the user, being past the bulk limit. */
  get overBulkLimit() {
    return this.mutations + this.held.length >= BULK_LIMIT;
  }
}

/** A stored pending action. */
export interface PendingAction {
  readonly id: string;
  /** The bubble that shows it. */
  readonly messageId: string;
  /** The thread's last row when it was held: only a user message after it can confirm. */
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

/** Pending actions in the agent's SQLite. At most one is `pending` at a time. */
export class PendingActions {
  constructor(private readonly sql: SqlStorage) {}

  migrate() {
    this.sql.exec(SCHEMA);
  }

  /**
   * Holds `calls` for the user, shown on `messageId`. Any action still
   * pending expires; those are returned so their bubbles can say so.
   */
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

  /** The action waiting for the user, if it hasn't run out of time. */
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

  /**
   * Moves a pending action to `status`. Returns it, or `null` if it wasn't
   * pending any more (already answered, or expired by a newer one), so two
   * taps can't run it twice.
   */
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

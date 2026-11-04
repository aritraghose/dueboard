/// <reference types="@cloudflare/workers-types" />

// Tibo's check-ins in the Durable Object's SQLite (step 20): a log of every
// check-in it considered, which keeps one alarm (or a retried one) from
// sending twice, plus a few facts the
// agent keeps between wakes. The rules are in `./proactive-rules.ts`.

import type { ProactiveKind, SkipReason } from "./proactive-rules.ts";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS proactive_log (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  day TEXT NOT NULL,
  outcome TEXT NOT NULL,
  turn_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS proactive_log_day_idx ON proactive_log (day);
CREATE TABLE IF NOT EXISTS agent_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/** How long the log keeps a row. */
const LOG_DAYS = 30;

/** `sending` while the turn runs, then `sent` or why not. */
export type CheckInOutcome = "sending" | "sent" | SkipReason;

/** The agent's own facts: the plan's fingerprint, when the app was last open, what's been read. */
export type AgentStateKey = "proactive_plan" | "last_seen_at" | "read_seq";

export interface CheckInRow {
  readonly id: string;
  readonly kind: ProactiveKind;
  readonly day: string;
  readonly outcome: CheckInOutcome;
  readonly turnId: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export class ProactiveStore {
  constructor(private readonly sql: SqlStorage) {}

  migrate() {
    this.sql.exec(SCHEMA);
  }

  /**
   * Takes a check-in (`morning_plan:2026-11-04`) for
   * this run: `false` if it was already considered, so an alarm that fires
   * twice or a delivery retried never sends twice.
   */
  claim(id: string, kind: ProactiveKind, day: string, now: number): boolean {
    const cursor = this.sql.exec(
      `INSERT INTO proactive_log (id, kind, day, outcome, created_at, updated_at)
       VALUES (?, ?, ?, 'sending', ?, ?) ON CONFLICT (id) DO NOTHING`,
      id,
      kind,
      day,
      now,
      now,
    );
    return cursor.rowsWritten > 0;
  }

  finish(id: string, outcome: Exclude<CheckInOutcome, "sending">, turnId: string | null = null) {
    this.sql.exec(
      `UPDATE proactive_log SET outcome = ?, turn_id = coalesce(?, turn_id), updated_at = ? WHERE id = ?`,
      outcome,
      turnId,
      Date.now(),
      id,
    );
  }

  /** Check-ins sent (or being sent) on a day (dev route). */
  sentOn(day: string): number {
    return this.sql
      .exec<{ n: number }>(
        `SELECT count(*) AS n FROM proactive_log WHERE day = ? AND outcome IN ('sending', 'sent')`,
        day,
      )
      .one().n;
  }

  /** The newest rows, for the dev route. */
  recent(limit: number): CheckInRow[] {
    return this.sql
      .exec<{
        id: string;
        kind: ProactiveKind;
        day: string;
        outcome: CheckInOutcome;
        turn_id: string | null;
        created_at: number;
        updated_at: number;
      }>(`SELECT * FROM proactive_log ORDER BY created_at DESC LIMIT ?`, limit)
      .toArray()
      .map((row) => ({
        id: row.id,
        kind: row.kind,
        day: row.day,
        outcome: row.outcome,
        turnId: row.turn_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
  }

  /** Drops rows older than the log keeps; a stuck `sending` row from a restart mid-turn ends as `failed`. */
  prune(now: number) {
    this.sql.exec(`DELETE FROM proactive_log WHERE created_at < ?`, now - LOG_DAYS * 24 * 60 * 60_000);
    this.sql.exec(
      `UPDATE proactive_log SET outcome = 'failed', updated_at = ? WHERE outcome = 'sending' AND updated_at < ?`,
      now,
      now - 10 * 60_000,
    );
  }

  /** Development only: forget a check-in, so "fire now" can run it again. */
  forget(id: string) {
    this.sql.exec(`DELETE FROM proactive_log WHERE id = ?`, id);
  }

  get(key: AgentStateKey): string | null {
    return this.sql.exec<{ value: string }>(`SELECT value FROM agent_state WHERE key = ?`, key).toArray()[0]?.value ?? null;
  }

  getNumber(key: AgentStateKey): number | null {
    const value = this.get(key);
    return value === null ? null : Number(value);
  }

  set(key: AgentStateKey, value: string | number) {
    this.sql.exec(
      `INSERT INTO agent_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      key,
      String(value),
    );
  }
}

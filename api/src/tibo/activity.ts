/// <reference types="@cloudflare/workers-types" />

// What Tibo is doing and has done (architecture.md §7.10), in the user's
// own `TiboAgent` SQLite: threads (a reply, a check-in, a reminder, memory
// upkeep…) and their steps (reading, thinking, each tool, writing). Every
// change is broadcast as an `activity` frame, so the inbox's side section
// shows the current one live and the Activity tab grows as it happens.

import { ACTIVITY_KEEP_DAYS, ACTIVITY_KEEP_THREADS } from "./activity-rules.ts";
import type {
  TiboActivity,
  TiboActivityKind,
  TiboActivityStatus,
  TiboActivityThread,
} from "./protocol.ts";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  detail TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'done', 'failed', 'skipped')),
  started_at INTEGER NOT NULL,
  ended_at INTEGER
);
CREATE INDEX IF NOT EXISTS activity_threads_idx ON activity_log (started_at) WHERE parent_id IS NULL;
CREATE INDEX IF NOT EXISTS activity_parent_idx ON activity_log (parent_id);
CREATE INDEX IF NOT EXISTS activity_running_idx ON activity_log (status) WHERE status = 'running';
`;

type Row = {
  id: string;
  parent_id: string | null;
  kind: TiboActivityKind;
  label: string;
  detail: string | null;
  status: TiboActivityStatus;
  started_at: number;
  ended_at: number | null;
};

const toActivity = (row: Row): TiboActivity => ({
  id: row.id,
  ...(row.parent_id ? { parentId: row.parent_id } : {}),
  kind: row.kind,
  label: row.label,
  ...(row.detail ? { detail: row.detail } : {}),
  status: row.status,
  startedAt: row.started_at,
  ...(row.ended_at !== null ? { endedAt: row.ended_at } : {}),
});

/** The longest label or detail kept. */
const TEXT_MAX = 300;
const clip = (text: string) => (text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX - 1)}…` : text);

export class ActivityLog {
  constructor(
    private readonly sql: SqlStorage,
    /** Tells every open tab. */
    private readonly emit: (activity: TiboActivity) => void,
  ) {}

  migrate() {
    this.sql.exec(SCHEMA);
  }

  /** Starts a thread (no `parentId`) or a step. */
  start(input: { kind: TiboActivityKind; label: string; detail?: string; parentId?: string }): Activity {
    const row = this.sql
      .exec<Row>(
        `INSERT INTO activity_log (id, parent_id, kind, label, detail, status, started_at)
         VALUES (?, ?, ?, ?, ?, 'running', ?) RETURNING *`,
        crypto.randomUUID(),
        input.parentId ?? null,
        input.kind,
        clip(input.label),
        input.detail ? clip(input.detail) : null,
        Date.now(),
      )
      .one();
    this.emit(toActivity(row));
    return new Activity(this, row.id);
  }

  /** Changes a running activity's detail (and label). */
  update(id: string, patch: { label?: string; detail?: string }) {
    const row = this.sql
      .exec<Row>(
        `UPDATE activity_log SET label = coalesce(?, label), detail = coalesce(?, detail)
         WHERE id = ? AND status = 'running' RETURNING *`,
        patch.label ? clip(patch.label) : null,
        patch.detail ? clip(patch.detail) : null,
        id,
      )
      .toArray()[0];
    if (row) this.emit(toActivity(row));
  }

  /** Ends an activity, once (and any of its steps still running, the same way). */
  finish(id: string, status: Exclude<TiboActivityStatus, "running">, detail?: string) {
    const now = Date.now();
    const steps = this.sql
      .exec<Row>(
        `UPDATE activity_log SET status = ?, ended_at = ? WHERE parent_id = ? AND status = 'running' RETURNING *`,
        status === "done" ? "done" : status,
        now,
        id,
      )
      .toArray();
    for (const step of steps) this.emit(toActivity(step));
    const row = this.sql
      .exec<Row>(
        `UPDATE activity_log SET status = ?, ended_at = ?, detail = coalesce(?, detail)
         WHERE id = ? AND status = 'running' RETURNING *`,
        status,
        now,
        detail ? clip(detail) : null,
        id,
      )
      .toArray()[0];
    if (row) this.emit(toActivity(row));
  }

  /** Everything running now (threads and steps). */
  running(): TiboActivity[] {
    return this.sql
      .exec<Row>(`SELECT * FROM activity_log WHERE status = 'running' ORDER BY started_at`)
      .toArray()
      .map(toActivity);
  }

  /**
   * After a restart: whatever was running died with the old instance (its
   * turn state lived in memory), so it ends as failed.
   */
  interruptRunning() {
    this.sql.exec(
      `UPDATE activity_log SET status = 'failed', ended_at = ?, detail = coalesce(detail, 'Interrupted')
       WHERE status = 'running'`,
      Date.now(),
    );
  }

  /** Threads that started before `before` (ms), newest first, with their steps. */
  page(before: number, limit: number): { threads: TiboActivityThread[]; hasMore: boolean } {
    const rows = this.sql
      .exec<Row>(
        `SELECT * FROM activity_log WHERE parent_id IS NULL AND started_at < ? ORDER BY started_at DESC LIMIT ?`,
        before,
        limit + 1,
      )
      .toArray();
    const threads = rows.slice(0, limit);
    const steps = new Map<string, TiboActivity[]>();
    if (threads.length > 0) {
      const ids = threads.map((thread) => thread.id);
      const found = this.sql
        .exec<Row>(
          `SELECT * FROM activity_log WHERE parent_id IN (${ids.map(() => "?").join(",")}) ORDER BY started_at`,
          ...ids,
        )
        .toArray();
      for (const step of found) steps.set(step.parent_id!, [...(steps.get(step.parent_id!) ?? []), toActivity(step)]);
    }
    return {
      threads: threads.map((thread) => ({ ...toActivity(thread), steps: steps.get(thread.id) ?? [] })),
      hasMore: rows.length > limit,
    };
  }

  /** Drops threads (with their steps) past `ACTIVITY_KEEP_DAYS` or the newest `ACTIVITY_KEEP_THREADS`. */
  prune(now: number) {
    const cutoff = now - ACTIVITY_KEEP_DAYS * 24 * 60 * 60 * 1000;
    const nth = this.sql
      .exec<{ started_at: number }>(
        `SELECT started_at FROM activity_log WHERE parent_id IS NULL ORDER BY started_at DESC LIMIT 1 OFFSET ?`,
        ACTIVITY_KEEP_THREADS,
      )
      .toArray()[0];
    const before = Math.max(cutoff, nth ? nth.started_at + 1 : 0);
    this.sql.exec(
      `DELETE FROM activity_log WHERE status != 'running' AND (
         (parent_id IS NULL AND started_at < ?) OR
         parent_id IN (SELECT id FROM activity_log WHERE parent_id IS NULL AND started_at < ?)
       )`,
      before,
      before,
    );
  }
}

/** One running thread or step. */
export class Activity {
  constructor(
    private readonly log: ActivityLog,
    readonly id: string,
  ) {}

  /** A step of this thread. */
  step(kind: TiboActivityKind, label: string, detail?: string): Activity {
    return this.log.start({ kind, label, parentId: this.id, ...(detail ? { detail } : {}) });
  }

  set(patch: { label?: string; detail?: string }) {
    this.log.update(this.id, patch);
  }

  end(status: Exclude<TiboActivityStatus, "running"> = "done", detail?: string) {
    this.log.finish(this.id, status, detail);
  }
}

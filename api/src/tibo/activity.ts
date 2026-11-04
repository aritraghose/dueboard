/// <reference types="@cloudflare/workers-types" />

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

const TEXT_MAX = 300;
const clip = (text: string) => (text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX - 1)}…` : text);

export class ActivityLog {
  constructor(
    private readonly sql: SqlStorage,
    private readonly emit: (activity: TiboActivity) => void,
  ) {}

  migrate() {
    this.sql.exec(SCHEMA);
  }

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

  running(): TiboActivity[] {
    return this.sql
      .exec<Row>(`SELECT * FROM activity_log WHERE status = 'running' ORDER BY started_at`)
      .toArray()
      .map(toActivity);
  }

  interruptRunning() {
    this.sql.exec(
      `UPDATE activity_log SET status = 'failed', ended_at = ?, detail = coalesce(detail, 'Interrupted')
       WHERE status = 'running'`,
      Date.now(),
    );
  }

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

export class Activity {
  constructor(
    private readonly log: ActivityLog,
    readonly id: string,
  ) {}

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

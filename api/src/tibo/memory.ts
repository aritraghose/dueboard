/// <reference types="@cloudflare/workers-types" />

import { EMBEDDING_MODEL } from "./embeddings.ts";
import type { Chunk, SummaryLevel } from "./memory-rules.ts";
import type { TiboMemory, TiboMemoryKind } from "./protocol.ts";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS summaries (
  level TEXT NOT NULL CHECK (level IN ('day', 'week', 'month', 'year')),
  period_start TEXT NOT NULL,
  text TEXT NOT NULL,
  through_message_id TEXT NOT NULL,
  through_seq INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (level, period_start)
);
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('fact', 'preference', 'person', 'event', 'plan')),
  importance INTEGER NOT NULL DEFAULT 1 CHECK (importance BETWEEN 1 AND 3),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  superseded_by TEXT,
  source_message_ids TEXT NOT NULL DEFAULT '[]',
  embedding_model TEXT
);
CREATE INDEX IF NOT EXISTS memories_active_idx ON memories (superseded_by, updated_at);
CREATE TABLE IF NOT EXISTS message_chunks (
  id TEXT PRIMARY KEY,
  from_seq INTEGER NOT NULL,
  to_seq INTEGER NOT NULL,
  day TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  text TEXT NOT NULL,
  embedding_model TEXT
);
CREATE TABLE IF NOT EXISTS memory_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export interface MemoryRow extends TiboMemory {
  readonly importance: number;
  readonly supersededBy: string | null;
  readonly sourceMessageIds: readonly string[];
}

export interface SummaryRow {
  readonly level: SummaryLevel;
  readonly periodStart: string;
  readonly text: string;
  readonly throughMessageId: string;
  readonly throughSeq: number;
  readonly updatedAt: number;
}

export interface ChunkRow {
  readonly id: string;
  readonly day: string;
  readonly startedAt: number;
  readonly text: string;
}

type MemoryDbRow = {
  id: string;
  text: string;
  kind: TiboMemoryKind;
  importance: number;
  created_at: number;
  updated_at: number;
  superseded_by: string | null;
  source_message_ids: string;
};

const toMemory = (row: MemoryDbRow): MemoryRow => ({
  id: row.id,
  text: row.text,
  kind: row.kind,
  importance: row.importance,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  supersededBy: row.superseded_by,
  sourceMessageIds: JSON.parse(row.source_message_ids) as string[],
});

type SummaryDbRow = {
  level: SummaryLevel;
  period_start: string;
  text: string;
  through_message_id: string;
  through_seq: number;
  updated_at: number;
};

const toSummary = (row: SummaryDbRow): SummaryRow => ({
  level: row.level,
  periodStart: row.period_start,
  text: row.text,
  throughMessageId: row.through_message_id,
  throughSeq: row.through_seq,
  updatedAt: row.updated_at,
});

export const memoryVectorId = (id: string) => `m:${id}`;
export const chunkVectorId = (id: string) => `c:${id}`;
export const parseVectorId = (vectorId: string) =>
  vectorId.startsWith("m:")
    ? ({ type: "memory", id: vectorId.slice(2) } as const)
    : vectorId.startsWith("c:")
      ? ({ type: "message", id: vectorId.slice(2) } as const)
      : null;

type StateKey =
  | "summarized_seq"
  | "extracted_seq"
  | "chunked_seq"
  | "time_zone"
  | "first_name"
  | "dirty_rollups"
  | "budget_day"
  | "budget_model_calls"
  | "budget_embeddings";

export class MemoryStore {
  constructor(private readonly sql: SqlStorage) {}

  migrate() {
    this.sql.exec(SCHEMA);
  }

  get(key: StateKey): string | null {
    return this.sql.exec<{ value: string }>(`SELECT value FROM memory_state WHERE key = ?`, key).toArray()[0]?.value ?? null;
  }

  getNumber(key: StateKey): number {
    return Number(this.get(key) ?? 0);
  }

  set(key: StateKey, value: string | number) {
    this.sql.exec(
      `INSERT INTO memory_state (key, value) VALUES (?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      key,
      String(value),
    );
  }

  spend(what: "model_calls" | "embeddings", amount: number, cap: number, today: string): boolean {
    if (this.get("budget_day") !== today) {
      this.set("budget_day", today);
      this.set("budget_model_calls", 0);
      this.set("budget_embeddings", 0);
    }
    const key = what === "model_calls" ? "budget_model_calls" : "budget_embeddings";
    const spent = this.getNumber(key);
    if (spent + amount > cap) return false;
    this.set(key, spent + amount);
    return true;
  }

  dirtyRollups(): Set<string> {
    return new Set(JSON.parse(this.get("dirty_rollups") ?? "[]") as string[]);
  }

  setDirtyRollups(keys: Set<string>) {
    this.set("dirty_rollups", JSON.stringify([...keys].sort()));
  }

  summary(level: SummaryLevel, periodStart: string): SummaryRow | null {
    const row = this.sql
      .exec<SummaryDbRow>(`SELECT * FROM summaries WHERE level = ? AND period_start = ?`, level, periodStart)
      .toArray()[0];
    return row ? toSummary(row) : null;
  }

  summariesBetween(level: SummaryLevel, from: string, to: string): SummaryRow[] {
    return this.sql
      .exec<SummaryDbRow>(
        `SELECT * FROM summaries WHERE level = ? AND period_start >= ? AND period_start < ? ORDER BY period_start`,
        level,
        from,
        to,
      )
      .toArray()
      .map(toSummary);
  }

  latestSummaries(level: SummaryLevel, limit: number): SummaryRow[] {
    return this.sql
      .exec<SummaryDbRow>(`SELECT * FROM summaries WHERE level = ? ORDER BY period_start DESC LIMIT ?`, level, limit)
      .toArray()
      .map(toSummary);
  }

  saveSummary(input: { level: SummaryLevel; periodStart: string; text: string; throughMessageId: string; throughSeq: number }) {
    this.sql.exec(
      `INSERT INTO summaries (level, period_start, text, through_message_id, through_seq, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (level, period_start) DO UPDATE SET
         text = excluded.text, through_message_id = excluded.through_message_id,
         through_seq = excluded.through_seq, updated_at = excluded.updated_at`,
      input.level,
      input.periodStart,
      input.text,
      input.throughMessageId,
      input.throughSeq,
      Date.now(),
    );
  }

  memory(id: string): MemoryRow | null {
    const row = this.sql.exec<MemoryDbRow>(`SELECT * FROM memories WHERE id = ?`, id).toArray()[0];
    return row ? toMemory(row) : null;
  }

  activeMemories(ids: readonly string[]): MemoryRow[] {
    if (ids.length === 0) return [];
    return this.sql
      .exec<MemoryDbRow>(
        `SELECT * FROM memories WHERE superseded_by IS NULL AND id IN (${ids.map(() => "?").join(", ")})`,
        ...ids,
      )
      .toArray()
      .map(toMemory);
  }

  listActive(limit: number): MemoryRow[] {
    return this.sql
      .exec<MemoryDbRow>(`SELECT * FROM memories WHERE superseded_by IS NULL ORDER BY created_at DESC LIMIT ?`, limit)
      .toArray()
      .map(toMemory);
  }

  recentImportant(minImportance: number, limit: number): MemoryRow[] {
    return this.sql
      .exec<MemoryDbRow>(
        `SELECT * FROM memories WHERE superseded_by IS NULL AND importance >= ?
         ORDER BY updated_at DESC LIMIT ?`,
        minImportance,
        limit,
      )
      .toArray()
      .map(toMemory);
  }

  countActive(): number {
    return this.sql.exec<{ n: number }>(`SELECT count(*) AS n FROM memories WHERE superseded_by IS NULL`).one().n;
  }

  addMemory(input: {
    text: string;
    kind: TiboMemoryKind;
    importance: number;
    sourceMessageIds: readonly string[];
    at?: number;
  }): MemoryRow {
    const now = input.at ?? Date.now();
    const row = this.sql
      .exec<MemoryDbRow>(
        `INSERT INTO memories (id, text, kind, importance, created_at, updated_at, source_message_ids)
         VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
        crypto.randomUUID(),
        input.text,
        input.kind,
        Math.min(3, Math.max(1, Math.round(input.importance))),
        now,
        now,
        JSON.stringify(input.sourceMessageIds),
      )
      .one();
    return toMemory(row);
  }

  supersede(ids: readonly string[], byId: string) {
    for (const id of ids) {
      this.sql.exec(
        `UPDATE memories SET superseded_by = ?, updated_at = ? WHERE id = ? AND superseded_by IS NULL AND id != ?`,
        byId,
        Date.now(),
        id,
        byId,
      );
    }
  }

  confirmMemory(id: string, sourceMessageIds: readonly string[]) {
    const memory = this.memory(id);
    if (!memory) return;
    const sources = [...new Set([...memory.sourceMessageIds, ...sourceMessageIds])].slice(-20);
    this.sql.exec(
      `UPDATE memories SET source_message_ids = ?, updated_at = ? WHERE id = ?`,
      JSON.stringify(sources),
      Date.now(),
      id,
    );
  }

  deleteMemory(id: string) {
    this.sql.exec(`DELETE FROM memories WHERE id = ?`, id);
  }

  memoriesToEmbed(limit: number): MemoryRow[] {
    return this.sql
      .exec<MemoryDbRow>(
        `SELECT * FROM memories WHERE superseded_by IS NULL AND (embedding_model IS NULL OR embedding_model != ?)
         ORDER BY created_at LIMIT ?`,
        EMBEDDING_MODEL,
        limit,
      )
      .toArray()
      .map(toMemory);
  }

  markMemoriesEmbedded(ids: readonly string[]) {
    for (const id of ids) this.sql.exec(`UPDATE memories SET embedding_model = ? WHERE id = ?`, EMBEDDING_MODEL, id);
  }

  addChunk(chunk: Chunk): string {
    const id = crypto.randomUUID();
    this.sql.exec(
      `INSERT INTO message_chunks (id, from_seq, to_seq, day, started_at, ended_at, text) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      chunk.fromSeq,
      chunk.toSeq,
      chunk.day,
      chunk.startedAt,
      chunk.endedAt,
      chunk.text,
    );
    return id;
  }

  chunks(ids: readonly string[]): ChunkRow[] {
    if (ids.length === 0) return [];
    return this.sql
      .exec<{ id: string; day: string; started_at: number; text: string }>(
        `SELECT id, day, started_at, text FROM message_chunks WHERE id IN (${ids.map(() => "?").join(", ")})`,
        ...ids,
      )
      .toArray()
      .map((row) => ({ id: row.id, day: row.day, startedAt: row.started_at, text: row.text }));
  }

  chunksToEmbed(limit: number): ChunkRow[] {
    return this.sql
      .exec<{ id: string; day: string; started_at: number; text: string }>(
        `SELECT id, day, started_at, text FROM message_chunks
         WHERE embedding_model IS NULL OR embedding_model != ? ORDER BY from_seq LIMIT ?`,
        EMBEDDING_MODEL,
        limit,
      )
      .toArray()
      .map((row) => ({ id: row.id, day: row.day, startedAt: row.started_at, text: row.text }));
  }

  markChunksEmbedded(ids: readonly string[]) {
    for (const id of ids) this.sql.exec(`UPDATE message_chunks SET embedding_model = ? WHERE id = ?`, EMBEDDING_MODEL, id);
  }

  allVectorIds(): string[] {
    return [
      ...this.sql.exec<{ id: string }>(`SELECT id FROM memories`).toArray().map((row) => memoryVectorId(row.id)),
      ...this.sql.exec<{ id: string }>(`SELECT id FROM message_chunks`).toArray().map((row) => chunkVectorId(row.id)),
    ];
  }

  stats() {
    const count = (query: string) => this.sql.exec<{ n: number }>(query).one().n;
    return {
      memories: count(`SELECT count(*) AS n FROM memories WHERE superseded_by IS NULL`),
      superseded: count(`SELECT count(*) AS n FROM memories WHERE superseded_by IS NOT NULL`),
      chunks: count(`SELECT count(*) AS n FROM message_chunks`),
      unembedded:
        count(`SELECT count(*) AS n FROM memories WHERE superseded_by IS NULL AND embedding_model IS NULL`) +
        count(`SELECT count(*) AS n FROM message_chunks WHERE embedding_model IS NULL`),
      summaries: Object.fromEntries(
        this.sql
          .exec<{ level: string; n: number }>(`SELECT level, count(*) AS n FROM summaries GROUP BY level`)
          .toArray()
          .map((row) => [row.level, row.n]),
      ),
    };
  }

  clear() {
    this.sql.exec(`DELETE FROM summaries; DELETE FROM memories; DELETE FROM message_chunks; DELETE FROM memory_state;`);
  }
}

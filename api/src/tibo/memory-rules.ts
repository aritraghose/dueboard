// Pure rules for Tibo's long-term memory (architecture.md §7.2–7.3): summary
// periods, thread chunks, token estimates, keyword queries and reading the
// model's JSON. No storage and no I/O, so they're unit-tested
// (`memory-rules.test.ts`).

import { addDays } from "./dates.ts";

// ─── Budgets and thresholds (planning.md decision log, step 19) ──────────

/** The context Tibo's reply is built in, before tools (about 4 characters a token). */
export const CONTEXT_BUDGET_TOKENS = 12_000;
/** Each section's share of it. The recent window gets what's left. */
export const SECTION_BUDGET_TOKENS = { story: 1_600, memories: 900 } as const;
/** The recent window never shrinks below this many messages to fit the budget. */
export const MIN_RECENT_MESSAGES = 10;

/** Memories found by meaning for the incoming message, and recent important ones. */
export const RELEVANT_MEMORIES = 8;
export const IMPORTANT_MEMORIES = 6;
/** The lowest similarity (cosine) for a memory to count as relevant to a message. */
export const RELEVANT_SCORE = 0.4;
/** The lowest similarity for an existing memory to be weighed as a duplicate or a contradiction. */
export const RELATED_SCORE = 0.5;

/** New messages that trigger an extraction pass (sooner if they've waited `SETTLE_MS`). */
export const EXTRACT_BATCH = 16;
/** Most messages read by one extraction call. */
export const EXTRACT_MAX = 40;
/** Messages of today that trigger a partial day summary before the day ends. */
export const DAY_SUMMARY_THRESHOLD = 60;
/** Messages per thread chunk, and its longest text. */
export const CHUNK_MESSAGES = 8;
export const CHUNK_CHARS = 1_500;
/** How long a quiet thread waits before its last messages are extracted and chunked. */
export const SETTLE_MS = 20 * 60_000;

/** Background model calls (Muse Spark) and embedded texts per user per day. Never charged to the quota. */
export const DAILY_JOB_CAP = { modelCalls: 40, embeddings: 600 } as const;
/** Under `alchemy dev`, so a seeded history digests in one go. */
export const DEV_DAILY_JOB_CAP = { modelCalls: 600, embeddings: 6_000 } as const;
/** Model calls one job run makes before it hands over to the next (each run is its own alarm). */
export const CALLS_PER_RUN = 12;
/** Model calls run side by side within a run. */
export const PARALLEL_CALLS = 4;
/** The longest one background model call may take. */
export const MODEL_CALL_TIMEOUT_MS = 120_000;

/** Longest summary per level, in words (asked of the model). */
export const SUMMARY_WORDS = { day: 120, week: 150, month: 200, year: 250 } as const;

// ─── Tokens ───────────────────────────────────────────────────────────────

/** A rough token count: about 4 characters a token. Good enough for budgets. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

/** `text` cut to about `tokens`, on a word boundary, with an ellipsis when cut. */
export const truncateToTokens = (text: string, tokens: number) => {
  const max = tokens * 4;
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${space > max * 0.6 ? cut.slice(0, space) : cut}…`;
};

// ─── Summary periods ──────────────────────────────────────────────────────

export const SUMMARY_LEVELS = ["day", "week", "month", "year"] as const;
export type SummaryLevel = (typeof SUMMARY_LEVELS)[number];

const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

/**
 * The first day of the period of `level` holding `day` (all `YYYY-MM-DD`).
 * Weeks start on Monday.
 */
export const periodStart = (level: SummaryLevel, day: string): string => {
  switch (level) {
    case "day":
      return day;
    case "week":
      return addDays(day, -((weekday(day) + 6) % 7));
    case "month":
      return `${day.slice(0, 7)}-01`;
    case "year":
      return `${day.slice(0, 4)}-01-01`;
  }
};

/** The first day after the period starting at `start`. */
export const periodEnd = (level: SummaryLevel, start: string): string => {
  switch (level) {
    case "day":
      return addDays(start, 1);
    case "week":
      return addDays(start, 7);
    case "month": {
      const [year, month] = start.split("-").map(Number) as [number, number];
      return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
    }
    case "year":
      return `${Number(start.slice(0, 4)) + 1}-01-01`;
  }
};

/**
 * The summaries a period rolls into: a day into its week and its month
 * (months roll up from their own days, not from weeks, which can straddle
 * two months), a month into its year. Weeks roll into nothing.
 */
export const parentPeriods = (level: SummaryLevel, start: string): { level: SummaryLevel; start: string }[] => {
  switch (level) {
    case "day":
      return [
        { level: "week", start: periodStart("week", start) },
        { level: "month", start: periodStart("month", start) },
      ];
    case "month":
      return [{ level: "year", start: periodStart("year", start) }];
    case "week":
    case "year":
      return [];
  }
};

/** The level a period is rolled up from. */
export const childLevel = (level: Exclude<SummaryLevel, "day">): SummaryLevel =>
  ({ week: "day", month: "day", year: "month" } as const)[level];

const formatDay = (day: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options }).format(new Date(`${day}T12:00:00Z`));

/** "Tue, Nov 3, 2026", "Week of Oct 26, 2026", "October 2026", "2026". */
export const periodLabel = (level: SummaryLevel, start: string): string => {
  switch (level) {
    case "day":
      return formatDay(start, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    case "week":
      return `Week of ${formatDay(start, { month: "short", day: "numeric", year: "numeric" })}`;
    case "month":
      return formatDay(start, { month: "long", year: "numeric" });
    case "year":
      return start.slice(0, 4);
  }
};

/** "Mar 2025": when a memory was learned. */
export const monthLabel = (day: string) => formatDay(day, { month: "short", year: "numeric" });

// ─── Thread chunks ────────────────────────────────────────────────────────

export interface ChunkInput {
  readonly seq: number;
  readonly role: "user" | "tibo" | "system_event";
  readonly body: string;
  readonly createdAt: number;
  /** Its day in the user's zone. */
  readonly day: string;
}

export interface Chunk {
  readonly fromSeq: number;
  readonly toSeq: number;
  readonly day: string;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly text: string;
}

const SPEAKER = { user: "User", tibo: "Tibo", system_event: "App" } as const;

/** One line of a transcript the background jobs and chunks read. */
export const transcriptLine = (message: Pick<ChunkInput, "role" | "body">) =>
  `${SPEAKER[message.role]}: ${message.body.replace(/\s+/g, " ").trim()}`;

/**
 * Consecutive messages grouped into chunks for embedding: never across a
 * day, at most `CHUNK_MESSAGES` messages and about `CHUNK_CHARS` characters
 * each, led by the day so a chunk's vector knows when it was said. A
 * trailing chunk that could still grow is left out unless `final`: its
 * messages wait for the next pass.
 */
export const chunkMessages = (messages: readonly ChunkInput[], final: boolean): Chunk[] => {
  const chunks: Chunk[] = [];
  let current: ChunkInput[] = [];
  let length = 0;
  const flush = () => {
    if (current.length === 0) return;
    const first = current[0]!;
    const last = current.at(-1)!;
    chunks.push({
      fromSeq: first.seq,
      toSeq: last.seq,
      day: first.day,
      startedAt: first.createdAt,
      endedAt: last.createdAt,
      text: [`[${first.day}]`, ...current.map(transcriptLine)].join("\n"),
    });
    current = [];
    length = 0;
  };
  for (const message of messages) {
    const line = transcriptLine(message).length;
    if (current.length > 0 && (message.day !== current[0]!.day || length + line > CHUNK_CHARS)) flush();
    current.push(message);
    length += line;
    if (current.length >= CHUNK_MESSAGES) flush();
  }
  if (final) flush();
  return chunks;
};

// ─── Keyword search ───────────────────────────────────────────────────────

const STOPWORDS = new Set(
  (
    "a an and are as at be but by did do does for from had has have i i'm in is it its me my of on or our so " +
    "that the their them they this to was we were what when where which who why will with you your about " +
    "tell told say said know remember think again ever any can could would should"
  ).split(" "),
);

/**
 * An FTS5 query for free text: its meaningful words, each quoted (so no
 * operator syntax gets through), any of them matching. `null` when nothing
 * is left to search for.
 */
export const ftsQuery = (text: string): string | null => {
  const words = [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^\p{L}\p{N}']+/u)
        .map((word) => word.replace(/^'+|'+$/g, ""))
        .filter((word) => word.length >= 2 && !STOPWORDS.has(word)),
    ),
  ].slice(0, 12);
  return words.length > 0 ? words.map((word) => `"${word.replace(/"/g, "")}"`).join(" OR ") : null;
};

// ─── The model's JSON ─────────────────────────────────────────────────────

/** The first JSON object in a model's reply (which may wrap it in a code fence or words). */
export const parseModelJson = (text: string): unknown => {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
};

/** Cosine similarity of two vectors of the same length. */
export const cosine = (a: readonly number[], b: readonly number[]) => {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index]! * b[index]!;
    normA += a[index]! ** 2;
    normB += b[index]! ** 2;
  }
  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
};

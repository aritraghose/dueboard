import { fileLine, type FileLine } from "./attachment-rules.ts";
import { addDays } from "./dates.ts";

export const CONTEXT_BUDGET_TOKENS = 12_000;
export const SECTION_BUDGET_TOKENS = { story: 1_600, memories: 900 } as const;
export const MIN_RECENT_MESSAGES = 10;

export const RELEVANT_MEMORIES = 8;
export const IMPORTANT_MEMORIES = 6;
export const RELEVANT_SCORE = 0.4;
export const RELATED_SCORE = 0.5;

export const EXTRACT_BATCH = 16;
export const EXTRACT_MAX = 40;
export const DAY_SUMMARY_THRESHOLD = 60;
export const CHUNK_MESSAGES = 8;
export const CHUNK_CHARS = 1_500;
export const SETTLE_MS = 20 * 60_000;

export const DAILY_JOB_CAP = { modelCalls: 40, embeddings: 600 } as const;
export const DEV_DAILY_JOB_CAP = { modelCalls: 600, embeddings: 6_000 } as const;
export const CALLS_PER_RUN = 12;
export const PARALLEL_CALLS = 4;
export const MODEL_CALL_TIMEOUT_MS = 120_000;

export const SUMMARY_WORDS = { day: 120, week: 150, month: 200, year: 250 } as const;

export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

export const truncateToTokens = (text: string, tokens: number) => {
  const max = tokens * 4;
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${space > max * 0.6 ? cut.slice(0, space) : cut}…`;
};

export const SUMMARY_LEVELS = ["day", "week", "month", "year"] as const;
export type SummaryLevel = (typeof SUMMARY_LEVELS)[number];

const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

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

export const childLevel = (level: Exclude<SummaryLevel, "day">): SummaryLevel =>
  ({ week: "day", month: "day", year: "month" } as const)[level];

const formatDay = (day: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options }).format(new Date(`${day}T12:00:00Z`));

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

export const monthLabel = (day: string) => formatDay(day, { month: "short", year: "numeric" });

export interface ChunkInput {
  readonly seq: number;
  readonly role: "user" | "tibo" | "system_event";
  readonly body: string;
  readonly createdAt: number;
  readonly day: string;
  readonly files?: readonly FileLine[];
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

export const transcriptLine = (message: Pick<ChunkInput, "role" | "body" | "files">) =>
  `${SPEAKER[message.role]}: ${[message.body.replace(/\s+/g, " ").trim(), ...(message.files ?? []).map(fileLine)]
    .filter((part) => part.length > 0)
    .join(" ")}`;

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
      text: [`[${first.day}]`, ...current.map((message) => transcriptLine(message))].join("\n"),
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

const STOPWORDS = new Set(
  (
    "a an and are as at be but by did do does for from had has have i i'm in is it its me my of on or our so " +
    "that the their them they this to was we were what when where which who why will with you your about " +
    "tell told say said know remember think again ever any can could would should"
  ).split(" "),
);

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

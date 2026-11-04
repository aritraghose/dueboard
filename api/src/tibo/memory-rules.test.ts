import { describe, expect, test } from "bun:test";
import { startOfDayIn } from "./dates.ts";
import { devSeedThread } from "./dev-seed.ts";
import {
  CHUNK_MESSAGES,
  chunkMessages,
  cosine,
  ftsQuery,
  childLevel,
  parentPeriods,
  parseModelJson,
  periodEnd,
  periodLabel,
  periodStart,
  truncateToTokens,
  type ChunkInput,
} from "./memory-rules.ts";

describe("summary periods", () => {
  test("weeks start on Monday", () => {
    expect(periodStart("week", "2026-11-04")).toBe("2026-11-02");
    expect(periodStart("week", "2026-11-02")).toBe("2026-11-02");
    expect(periodStart("week", "2026-11-01")).toBe("2026-10-26");
  });

  test("months and years", () => {
    expect(periodStart("month", "2026-02-17")).toBe("2026-02-01");
    expect(periodStart("year", "2026-02-17")).toBe("2026-01-01");
    expect(periodEnd("month", "2026-12-01")).toBe("2027-01-01");
    expect(periodEnd("month", "2024-02-01")).toBe("2024-03-01");
    expect(periodEnd("week", "2026-12-28")).toBe("2027-01-04");
    expect(periodEnd("year", "2025-01-01")).toBe("2026-01-01");
  });

  test("a day rolls into its week and its month (never a straddling week's), a month into its year", () => {
    expect(parentPeriods("day", "2025-03-02")).toEqual([
      { level: "week", start: "2025-02-24" },
      { level: "month", start: "2025-03-01" },
    ]);
    expect(parentPeriods("month", "2026-10-01")).toEqual([{ level: "year", start: "2026-01-01" }]);
    expect(parentPeriods("week", "2026-10-26")).toEqual([]);
    expect(parentPeriods("year", "2026-01-01")).toEqual([]);
    expect([childLevel("week"), childLevel("month"), childLevel("year")]).toEqual(["day", "day", "month"]);
  });

  test("labels", () => {
    expect(periodLabel("day", "2026-11-03")).toBe("Tue, Nov 3, 2026");
    expect(periodLabel("week", "2026-10-26")).toBe("Week of Oct 26, 2026");
    expect(periodLabel("month", "2026-10-01")).toBe("October 2026");
    expect(periodLabel("year", "2025-01-01")).toBe("2025");
  });
});

const message = (seq: number, day: string, body = `message ${seq}`): ChunkInput => ({
  seq,
  role: seq % 2 === 0 ? "tibo" : "user",
  body,
  createdAt: Date.parse(`${day}T12:00:00Z`) + seq,
  day,
});

describe("chunkMessages", () => {
  test("never spans two days, and leads with the day", () => {
    const chunks = chunkMessages([message(1, "2025-03-02"), message(2, "2025-03-02"), message(3, "2025-03-05")], true);
    expect(chunks.map((chunk) => [chunk.fromSeq, chunk.toSeq, chunk.day])).toEqual([
      [1, 2, "2025-03-02"],
      [3, 3, "2025-03-05"],
    ]);
    expect(chunks[0]!.text).toBe("[2025-03-02]\nUser: message 1\nTibo: message 2");
  });

  test("caps the messages in a chunk", () => {
    const messages = Array.from({ length: CHUNK_MESSAGES + 3 }, (_, index) => message(index + 1, "2025-03-02"));
    const chunks = chunkMessages(messages, true);
    expect(chunks.map((chunk) => chunk.toSeq - chunk.fromSeq + 1)).toEqual([CHUNK_MESSAGES, 3]);
  });

  test("caps a chunk's length", () => {
    const long = "word ".repeat(200);
    const chunks = chunkMessages([message(1, "2025-03-02", long), message(2, "2025-03-02", long), message(3, "2025-03-02", long)], true);
    expect(chunks.length).toBeGreaterThan(1);
  });

  test("leaves a chunk that could still grow for later, unless final", () => {
    const messages = [message(1, "2025-03-02"), message(2, "2025-03-03"), message(3, "2025-03-03")];
    expect(chunkMessages(messages, false).map((chunk) => chunk.toSeq)).toEqual([1]);
    expect(chunkMessages(messages, true).map((chunk) => chunk.toSeq)).toEqual([1, 3]);
  });
});

describe("ftsQuery", () => {
  test("keeps the meaningful words, quoted, any of them", () => {
    expect(ftsQuery("What did I tell you about Portuguese in 2025?")).toBe('"portuguese" OR "2025"');
  });

  test("operator syntax can't get through", () => {
    expect(ftsQuery('mochi" OR NEAR(cat*')).toBe('"mochi" OR "near" OR "cat"');
  });

  test("nothing left to search", () => {
    expect(ftsQuery("what did you say?")).toBeNull();
  });
});

describe("the model's JSON", () => {
  test("found inside a code fence or words", () => {
    expect(parseModelJson('Sure!\n```json\n{"memories":[]}\n```')).toEqual({ memories: [] });
  });

  test("null when there's none", () => {
    expect(parseModelJson("no idea")).toBeNull();
    expect(parseModelJson("{broken")).toBeNull();
  });
});

describe("helpers", () => {
  test("truncateToTokens cuts on a word", () => {
    expect(truncateToTokens("short", 10)).toBe("short");
    const cut = truncateToTokens("alpha beta gamma delta epsilon zeta eta theta", 5);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(21);
  });

  test("cosine", () => {
    expect(cosine([1, 0], [1, 0])).toBe(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([0, 0], [1, 0])).toBe(0);
  });

  test("startOfDayIn follows the zone, DST included", () => {
    expect(new Date(startOfDayIn("UTC", "2026-11-04")).toISOString()).toBe("2026-11-04T00:00:00.000Z");
    expect(new Date(startOfDayIn("Asia/Kolkata", "2026-11-04")).toISOString()).toBe("2026-11-03T18:30:00.000Z");
    expect(new Date(startOfDayIn("America/New_York", "2026-03-08")).toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(new Date(startOfDayIn("America/New_York", "2026-03-09")).toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });
});

describe("dev seed", () => {
  test("oldest first, user first each day, bubbles share a turn", () => {
    const thread = devSeedThread();
    expect(thread.length).toBeGreaterThan(50);
    expect(thread.every((message, index) => index === 0 || message.createdAt > thread[index - 1]!.createdAt)).toBe(true);
    expect(thread[0]!.role).toBe("user");
    const [, first, second] = thread;
    expect(first!.role).toBe("tibo");
    expect(second!.turnId).toBe(first!.turnId);
  });
});

import { describe, expect, test } from "bun:test";
import { startOfDayInstant, type LocalDate } from "./dates.ts";
import { fits, limitFor, nextResetAt, periodOf, remainingUnits, toAiUsage } from "./usage-rules.ts";

const d = (value: string) => value as LocalDate;

describe("startOfDayInstant", () => {
  test("is local midnight", () => {
    expect(startOfDayInstant(d("2026-12-01"), "UTC").toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(startOfDayInstant(d("2026-12-01"), "Asia/Kolkata").toISOString()).toBe(
      "2026-11-30T18:30:00.000Z",
    );
    expect(startOfDayInstant(d("2026-12-01"), "America/New_York").toISOString()).toBe(
      "2026-12-01T05:00:00.000Z",
    );
  });

  test("follows the offset on DST days", () => {
    // New York springs forward at 2:00 on 2026-03-08; midnight is still EST.
    expect(startOfDayInstant(d("2026-03-08"), "America/New_York").toISOString()).toBe(
      "2026-03-08T05:00:00.000Z",
    );
    expect(startOfDayInstant(d("2026-03-09"), "America/New_York").toISOString()).toBe(
      "2026-03-09T04:00:00.000Z",
    );
  });

  test("skips to the first instant when midnight doesn't exist", () => {
    // Santiago jumps from 00:00 to 01:00 on 2026-09-06.
    const start = startOfDayInstant(d("2026-09-06"), "America/Santiago");
    expect(start.toISOString()).toBe("2026-09-06T04:00:00.000Z");
  });
});

describe("periodOf / nextResetAt", () => {
  const now = new Date("2026-11-30T20:00:00Z");

  test("use the user's month", () => {
    expect(periodOf(now, "UTC")).toBe("2026-11");
    // Already December 1st in Kolkata.
    expect(periodOf(now, "Asia/Kolkata")).toBe("2026-12");
  });

  test("reset at local midnight on the 1st", () => {
    expect(nextResetAt(now, "UTC").toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(nextResetAt(now, "Asia/Kolkata").toISOString()).toBe("2026-12-31T18:30:00.000Z");
    expect(nextResetAt(new Date("2026-12-15T00:00:00Z"), "UTC").toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
  });
});

describe("quota math", () => {
  test("an override replaces the quota", () => {
    expect(limitFor(null, 300)).toBe(300);
    expect(limitFor(1, 300)).toBe(1);
    expect(limitFor(0, 300)).toBe(0);
  });

  test("counts units, two per message", () => {
    expect(remainingUnits(0, 1)).toBe(2);
    expect(fits(0, 1, 2)).toBe(true);
    expect(fits(2, 1, 2)).toBe(false);
    // Half a message left: a relay's share fits, a reply doesn't.
    expect(fits(1, 1, 1)).toBe(true);
    expect(fits(1, 1, 2)).toBe(false);
    expect(remainingUnits(10, 1)).toBe(0);
  });

  test("shows whole messages that add up to the limit", () => {
    const now = new Date("2026-11-03T12:00:00Z");
    const usage = toAiUsage(3, 300, now, "UTC");
    expect(usage.remaining).toBe(298);
    expect(usage.used).toBe(2);
    expect(usage.limit).toBe(300);
    expect(usage.period).toBe("2026-11");
    expect(toAiUsage(2, 1, now, "UTC").remaining).toBe(0);
    expect(toAiUsage(50, 1, now, "UTC").used).toBe(1);
  });
});

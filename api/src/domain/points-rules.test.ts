import { describe, expect, test } from "bun:test";
import type { LocalDate } from "./dates.ts";
import { periodStart } from "./points-rules.ts";

// Tuesday, November 3, 2026.
const today = "2026-11-03" as LocalDate;

describe("periodStart", () => {
  test("all time has no start", () => {
    expect(periodStart("all", today)).toBeNull();
  });

  test("this month starts on the 1st", () => {
    expect(periodStart("month", today)).toBe("2026-11-01" as LocalDate);
  });

  test("this week starts on Sunday", () => {
    expect(periodStart("week", today)).toBe("2026-11-01" as LocalDate);
    expect(periodStart("week", "2026-11-07" as LocalDate)).toBe("2026-11-01" as LocalDate);
    expect(periodStart("week", "2026-11-08" as LocalDate)).toBe("2026-11-08" as LocalDate);
  });

  test("today is just today", () => {
    expect(periodStart("today", today)).toBe(today);
  });
});

import { describe, expect, test } from "bun:test";
import type { LocalDate } from "./dates.ts";
import { DIARY_PAGE_DAYS, GRAPH_KINDS, graphRange, pickDiaryDays } from "./diary-rules.ts";

const today = "2026-11-03" as LocalDate;
const d = (value: string) => value as LocalDate;

describe("graphRange", () => {
  test("defaults to 53 Sunday-starting weeks ending today", () => {
    expect(graphRange(today)).toEqual({ from: d("2025-11-02"), to: today });
  });

  test("a range ending on a Saturday still starts on a Sunday", () => {
    expect(graphRange(today, undefined, d("2026-11-07"))).toEqual({ from: d("2025-11-02"), to: d("2026-11-07") });
  });

  test("a given start moves back to its Sunday", () => {
    expect(graphRange(today, d("2026-10-07"), d("2026-10-31"))).toEqual({ from: d("2026-10-04"), to: d("2026-10-31") });
  });

  test("an end before the start is refused", () => {
    expect(graphRange(today, d("2026-11-10"), d("2026-11-01"))).toBeNull();
  });

  test("more than 53 weeks is refused", () => {
    expect(graphRange(today, d("2025-11-01"), today)).toBeNull();
    expect(graphRange(today, d("2025-11-02"), d("2026-11-07"))).not.toBeNull();
    expect(graphRange(today, d("2025-11-02"), d("2026-11-08"))).toBeNull();
  });

  test("stopped sessions and goal moves aren't counted", () => {
    expect(GRAPH_KINDS).not.toContain("session_stopped" as never);
    expect(GRAPH_KINDS).not.toContain("goal_progressed" as never);
  });
});

describe("pickDiaryDays", () => {
  const day = (date: string, count: number) => ({ date: d(date), count });

  test("takes up to a week of quiet days", () => {
    const days = Array.from({ length: 10 }, (_, i) => day(`2026-10-${String(20 - i).padStart(2, "0")}`, 2));
    const { dates, more } = pickDiaryDays(days);
    expect(dates).toHaveLength(DIARY_PAGE_DAYS);
    expect(dates[0]).toBe(d("2026-10-20"));
    expect(more).toBe(true);
  });

  test("a busy first day comes whole, alone", () => {
    expect(pickDiaryDays([day("2026-11-03", 200), day("2026-11-02", 1)])).toEqual({
      dates: [d("2026-11-03")],
      more: true,
    });
  });

  test("stops before a day that would overflow the page", () => {
    expect(pickDiaryDays([day("2026-11-03", 40), day("2026-11-02", 20), day("2026-11-01", 1)])).toEqual({
      dates: [d("2026-11-03"), d("2026-11-02")],
      more: true,
    });
  });

  test("the last page says there's no more", () => {
    expect(pickDiaryDays([day("2026-11-03", 1)])).toEqual({ dates: [d("2026-11-03")], more: false });
    expect(pickDiaryDays([])).toEqual({ dates: [], more: false });
  });
});

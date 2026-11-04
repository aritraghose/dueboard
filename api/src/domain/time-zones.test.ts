import { describe, expect, test } from "bun:test";
import { dayIn, instantIn, startOfDayIn } from "../tibo/dates.ts";
import { addDays, isValidTimeZone, localDateOf, startOfDayInstant, startOfWeek, todayIn, type LocalDate } from "./dates.ts";
import { nextResetAt, periodOf } from "./usage-rules.ts";

// Step 24: one user far ahead of UTC and one far behind, through every
// zone-sensitive rule ("today", day boundaries, the quota month, Tibo's
// check-in instants). Kiritimati is UTC+14 all year; Pago Pago is UTC−11
// all year, and Etc/GMT+12 (UTC−12) is the furthest behind a browser can
// report. Together they are 26 hours apart, so the same instant can be
// three different calendar days.

const AHEAD = "Pacific/Kiritimati";
const BEHIND = "Pacific/Pago_Pago";
const FURTHEST_BEHIND = "Etc/GMT+12";
const d = (value: string) => value as LocalDate;

describe("far-ahead and far-behind users", () => {
  test("both zones are accepted", () => {
    expect(isValidTimeZone(AHEAD)).toBe(true);
    expect(isValidTimeZone(BEHIND)).toBe(true);
    expect(isValidTimeZone(FURTHEST_BEHIND)).toBe(true);
  });

  test("one instant, three calendar days", () => {
    // 2026-11-01 10:30 UTC
    const now = new Date(Date.UTC(2026, 10, 1, 10, 30));
    expect(todayIn(AHEAD, now)).toBe(d("2026-11-02")); // 00:30 on the 2nd
    expect(todayIn("UTC", now)).toBe(d("2026-11-01"));
    expect(todayIn(FURTHEST_BEHIND, now)).toBe(d("2026-10-31")); // 22:30 on the 31st
    // Tibo's own date math agrees with the domain's.
    expect(dayIn(AHEAD, now)).toBe("2026-11-02");
    expect(dayIn(FURTHEST_BEHIND, now)).toBe("2026-10-31");
  });

  test("a local day starts at the zone's midnight", () => {
    expect(startOfDayInstant(d("2026-11-02"), AHEAD).toISOString()).toBe("2026-11-01T10:00:00.000Z");
    expect(startOfDayInstant(d("2026-11-02"), BEHIND).toISOString()).toBe("2026-11-02T11:00:00.000Z");
    expect(new Date(startOfDayIn(AHEAD, "2026-11-02")).toISOString()).toBe("2026-11-01T10:00:00.000Z");
    expect(new Date(startOfDayIn(BEHIND, "2026-11-02")).toISOString()).toBe("2026-11-02T11:00:00.000Z");
  });

  test("the last and first second of a day land on the right side", () => {
    for (const zone of [AHEAD, BEHIND, FURTHEST_BEHIND]) {
      const start = startOfDayInstant(d("2026-11-02"), zone).getTime();
      expect(localDateOf(new Date(start), zone)).toBe(d("2026-11-02"));
      expect(localDateOf(new Date(start - 1000), zone)).toBe(d("2026-11-01"));
      const next = startOfDayInstant(addDays(d("2026-11-02"), 1), zone).getTime();
      expect(next - start).toBe(24 * 60 * 60_000);
    }
  });

  test("the quota month turns over at each user's own midnight", () => {
    // 2026-10-31 11:00 UTC: 01:00 on Nov 1 in Kiritimati, midnight
    // starting Oct 31 in Pago Pago.
    const now = new Date(Date.UTC(2026, 9, 31, 11, 0));
    expect(periodOf(now, AHEAD)).toBe("2026-11");
    expect(periodOf(now, BEHIND)).toBe("2026-10");
    expect(nextResetAt(now, AHEAD).toISOString()).toBe("2026-11-30T10:00:00.000Z");
    expect(nextResetAt(now, BEHIND).toISOString()).toBe("2026-11-01T11:00:00.000Z");
  });

  test("a year's last day: December in one zone, January in the other", () => {
    const now = new Date(Date.UTC(2026, 11, 31, 12, 0));
    expect(periodOf(now, AHEAD)).toBe("2027-01");
    expect(periodOf(now, BEHIND)).toBe("2026-12");
  });

  test("check-ins fire at the user's local time", () => {
    // An 08:00 morning plan on the user's Nov 2.
    expect(new Date(instantIn(AHEAD, "2026-11-02", "08:00")).toISOString()).toBe("2026-11-01T18:00:00.000Z");
    expect(new Date(instantIn(BEHIND, "2026-11-02", "08:00")).toISOString()).toBe("2026-11-02T19:00:00.000Z");
    // A 21:30 evening check stays on that local day, not the next UTC day's.
    const evening = instantIn(BEHIND, "2026-11-02", "21:30");
    expect(dayIn(BEHIND, new Date(evening))).toBe("2026-11-02");
    expect(new Date(evening).toISOString()).toBe("2026-11-03T08:30:00.000Z");
  });

  test("weeks start on the user's Sunday, whatever UTC's day is", () => {
    // Sat 2026-11-07 23:30 in Pago Pago is Sun 10:30 UTC and Mon 00:30 in Kiritimati.
    const now = new Date(Date.UTC(2026, 10, 8, 10, 30));
    expect(startOfWeek(todayIn(BEHIND, now))).toBe(d("2026-11-01"));
    expect(startOfWeek(todayIn(AHEAD, now))).toBe(d("2026-11-08"));
  });
});

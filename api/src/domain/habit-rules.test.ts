import { describe, expect, test } from "bun:test";
import type { LocalDate } from "./dates.ts";
import {
  dayStatus,
  describeSchedule,
  indexCheckins,
  isPausedOn,
  isScheduledOn,
  normalizeSchedule,
  ordinal,
  periodFor,
  progressFor,
  streak,
  type HabitCheckinCount,
  type HabitPause,
  type HabitRule,
} from "./habit-rules.ts";

const d = (value: string) => value as LocalDate;

const flexible = (
  targetCount: number,
  periodLength: number,
  periodUnit: HabitRule["periodUnit"],
  startDate = "2026-01-01",
): HabitRule => ({
  scheduleKind: "flexible",
  targetCount,
  periodUnit,
  periodLength,
  weekdays: null,
  monthDays: null,
  startDate: d(startDate),
});

const onWeekdays = (weekdays: Array<number>, targetCount = 1, startDate = "2026-01-01"): HabitRule => ({
  scheduleKind: "specific_days",
  targetCount,
  periodUnit: "day",
  periodLength: 1,
  weekdays,
  monthDays: null,
  startDate: d(startDate),
});

const onMonthDays = (monthDays: Array<number>, targetCount = 1, startDate = "2024-01-01"): HabitRule => ({
  scheduleKind: "specific_days",
  targetCount,
  periodUnit: "day",
  periodLength: 1,
  weekdays: null,
  monthDays,
  startDate: d(startDate),
});

/** `{ "2026-11-02": 2 }` → check-ins. */
const taps = (days: Record<string, number>): Array<HabitCheckinCount> =>
  Object.entries(days).map(([localDate, count]) => ({ localDate: d(localDate), count }));

/** One tap on each listed day. */
const tapped = (...days: Array<string>) => taps(Object.fromEntries(days.map((day) => [day, 1])));

const pause = (startDate: string, endDate: string | null = null): HabitPause => ({
  startDate: d(startDate),
  endDate: endDate === null ? null : d(endDate),
});

const period = (start: string, end: string) => ({ start: d(start), end: d(end) });

// November 2026: Sun 1, Sat 7, Sun 8 … Mon 30.

describe("normalizeSchedule", () => {
  test("flexible keeps its period and drops nothing", () => {
    expect(
      normalizeSchedule({ kind: "flexible", targetCount: 3, periodUnit: "week", periodLength: 1 }),
    ).toEqual({
      ok: true,
      columns: {
        scheduleKind: "flexible",
        targetCount: 3,
        periodUnit: "week",
        periodLength: 1,
        weekdays: null,
        monthDays: null,
      },
    });
  });

  test("flexible needs a period and no days", () => {
    expect(normalizeSchedule({ kind: "flexible", targetCount: 3, periodUnit: "week" }).ok).toBe(false);
    expect(normalizeSchedule({ kind: "flexible", targetCount: 3, periodLength: 2 }).ok).toBe(false);
    expect(
      normalizeSchedule({
        kind: "flexible",
        targetCount: 3,
        periodUnit: "week",
        periodLength: 1,
        weekdays: [1],
      }).ok,
    ).toBe(false);
  });

  test("an empty day list counts as none", () => {
    expect(
      normalizeSchedule({
        kind: "flexible",
        targetCount: 1,
        periodUnit: "day",
        periodLength: 1,
        weekdays: [],
        monthDays: null,
      }).ok,
    ).toBe(true);
  });

  test("specific days sorts, dedupes and stores day × 1", () => {
    expect(
      normalizeSchedule({
        kind: "specific_days",
        targetCount: 2,
        periodUnit: "month",
        periodLength: 4,
        weekdays: [5, 1, 3, 1],
      }),
    ).toEqual({
      ok: true,
      columns: {
        scheduleKind: "specific_days",
        targetCount: 2,
        periodUnit: "day",
        periodLength: 1,
        weekdays: [1, 3, 5],
        monthDays: null,
      },
    });
  });

  test("specific days needs exactly one list", () => {
    expect(normalizeSchedule({ kind: "specific_days", targetCount: 1 }).ok).toBe(false);
    expect(normalizeSchedule({ kind: "specific_days", targetCount: 1, weekdays: [] }).ok).toBe(false);
    expect(
      normalizeSchedule({ kind: "specific_days", targetCount: 1, weekdays: [1], monthDays: [1] }).ok,
    ).toBe(false);
    expect(normalizeSchedule({ kind: "specific_days", targetCount: 1, monthDays: [31, 1] })).toMatchObject({
      ok: true,
      columns: { monthDays: [1, 31], weekdays: null },
    });
  });
});

describe("periodFor", () => {
  test("a 1-week period is the Sunday-to-Saturday week, wherever start_date falls", () => {
    const habit = flexible(3, 1, "week", "2026-11-04"); // a Wednesday
    expect(periodFor(habit, d("2026-11-04"))).toEqual(period("2026-11-01", "2026-11-07"));
    expect(periodFor(habit, d("2026-11-01"))).toEqual(period("2026-11-01", "2026-11-07"));
    expect(periodFor(habit, d("2026-11-07"))).toEqual(period("2026-11-01", "2026-11-07"));
    expect(periodFor(habit, d("2026-11-08"))).toEqual(period("2026-11-08", "2026-11-14"));
  });

  test("a 1-week period spans a year boundary", () => {
    const habit = flexible(1, 1, "week");
    expect(periodFor(habit, d("2027-01-01"))).toEqual(period("2026-12-27", "2027-01-02"));
  });

  test("a 1-day period is the day", () => {
    const habit = flexible(5, 1, "day", "2026-11-04");
    expect(periodFor(habit, d("2026-11-20"))).toEqual(period("2026-11-20", "2026-11-20"));
  });

  test("5-day periods anchored mid-month run on across months", () => {
    const habit = flexible(2, 5, "day", "2026-11-17");
    expect(periodFor(habit, d("2026-11-17"))).toEqual(period("2026-11-17", "2026-11-21"));
    expect(periodFor(habit, d("2026-11-21"))).toEqual(period("2026-11-17", "2026-11-21"));
    expect(periodFor(habit, d("2026-11-22"))).toEqual(period("2026-11-22", "2026-11-26"));
    expect(periodFor(habit, d("2026-11-29"))).toEqual(period("2026-11-27", "2026-12-01"));
    expect(periodFor(habit, d("2026-12-02"))).toEqual(period("2026-12-02", "2026-12-06"));
  });

  test("anchored periods extend backwards before start_date", () => {
    const habit = flexible(2, 5, "day", "2026-11-17");
    expect(periodFor(habit, d("2026-11-16"))).toEqual(period("2026-11-12", "2026-11-16"));
  });

  test("multi-week periods start on start_date, not on Sunday", () => {
    const habit = flexible(1, 2, "week", "2026-11-04");
    expect(periodFor(habit, d("2026-11-04"))).toEqual(period("2026-11-04", "2026-11-17"));
    expect(periodFor(habit, d("2026-11-17"))).toEqual(period("2026-11-04", "2026-11-17"));
    expect(periodFor(habit, d("2026-11-18"))).toEqual(period("2026-11-18", "2026-12-01"));
  });

  test("a 1-month period is the calendar month, including leap Februaries", () => {
    const habit = flexible(10, 1, "month", "2023-06-15");
    expect(periodFor(habit, d("2026-11-17"))).toEqual(period("2026-11-01", "2026-11-30"));
    expect(periodFor(habit, d("2026-12-31"))).toEqual(period("2026-12-01", "2026-12-31"));
    expect(periodFor(habit, d("2026-02-10"))).toEqual(period("2026-02-01", "2026-02-28"));
    expect(periodFor(habit, d("2024-02-10"))).toEqual(period("2024-02-01", "2024-02-29"));
    expect(periodFor(habit, d("2023-06-01"))).toEqual(period("2023-06-01", "2023-06-30"));
  });

  test("multi-month periods are blocks of calendar months from start_date's month", () => {
    const habit = flexible(4, 2, "month", "2026-11-20");
    expect(periodFor(habit, d("2026-11-20"))).toEqual(period("2026-11-01", "2026-12-31"));
    expect(periodFor(habit, d("2026-12-31"))).toEqual(period("2026-11-01", "2026-12-31"));
    expect(periodFor(habit, d("2027-01-01"))).toEqual(period("2027-01-01", "2027-02-28"));
    expect(periodFor(habit, d("2027-03-15"))).toEqual(period("2027-03-01", "2027-04-30"));
    const quarterly = flexible(1, 3, "month", "2027-12-05");
    expect(periodFor(quarterly, d("2028-02-29"))).toEqual(period("2027-12-01", "2028-02-29"));
  });

  test("specific days: the period is the day", () => {
    expect(periodFor(onWeekdays([1, 3, 5]), d("2026-11-04"))).toEqual(period("2026-11-04", "2026-11-04"));
  });
});

describe("isScheduledOn", () => {
  test("a flexible habit is scheduled every day from start_date", () => {
    const habit = flexible(3, 1, "week", "2026-11-04");
    expect(isScheduledOn(habit, [], d("2026-11-03"))).toBe(false);
    expect(isScheduledOn(habit, [], d("2026-11-04"))).toBe(true);
    expect(isScheduledOn(habit, [], d("2026-11-05"))).toBe(true);
  });

  test("weekdays", () => {
    const habit = onWeekdays([1, 3, 5]);
    expect(isScheduledOn(habit, [], d("2026-11-01"))).toBe(false); // Sun
    expect(isScheduledOn(habit, [], d("2026-11-02"))).toBe(true); // Mon
    expect(isScheduledOn(habit, [], d("2026-11-03"))).toBe(false); // Tue
    expect(isScheduledOn(habit, [], d("2026-11-04"))).toBe(true); // Wed
    expect(isScheduledOn(habit, [], d("2026-11-06"))).toBe(true); // Fri
    expect(isScheduledOn(habit, [], d("2026-11-07"))).toBe(false); // Sat
  });

  test("month days", () => {
    const habit = onMonthDays([1, 15]);
    expect(isScheduledOn(habit, [], d("2026-11-01"))).toBe(true);
    expect(isScheduledOn(habit, [], d("2026-11-15"))).toBe(true);
    expect(isScheduledOn(habit, [], d("2026-11-16"))).toBe(false);
  });

  test("the 31st falls on the last day of shorter months", () => {
    const habit = onMonthDays([31]);
    expect(isScheduledOn(habit, [], d("2026-01-31"))).toBe(true);
    expect(isScheduledOn(habit, [], d("2026-02-28"))).toBe(true);
    expect(isScheduledOn(habit, [], d("2026-02-27"))).toBe(false);
    expect(isScheduledOn(habit, [], d("2026-04-30"))).toBe(true);
    expect(isScheduledOn(habit, [], d("2026-04-29"))).toBe(false);
  });

  test("the 29th and 30th in February, leap years included", () => {
    const habit = onMonthDays([29]);
    expect(isScheduledOn(habit, [], d("2024-02-29"))).toBe(true);
    expect(isScheduledOn(habit, [], d("2024-02-28"))).toBe(false);
    expect(isScheduledOn(habit, [], d("2026-02-28"))).toBe(true);
    expect(isScheduledOn(onMonthDays([30, 31]), [], d("2026-02-28"))).toBe(true);
    expect(isScheduledOn(onMonthDays([30]), [], d("2024-02-29"))).toBe(true);
  });

  test("the last day already listed isn't doubled", () => {
    const habit = onMonthDays([28, 31]);
    expect(isScheduledOn(habit, [], d("2026-02-28"))).toBe(true);
    expect(isScheduledOn(habit, [], d("2026-02-27"))).toBe(false);
  });

  test("never due on a paused day; the resume day is due again", () => {
    const habit = flexible(1, 1, "day");
    const pauses = [pause("2026-11-10", "2026-11-13")];
    expect(isScheduledOn(habit, pauses, d("2026-11-09"))).toBe(true);
    expect(isScheduledOn(habit, pauses, d("2026-11-10"))).toBe(false);
    expect(isScheduledOn(habit, pauses, d("2026-11-12"))).toBe(false);
    expect(isScheduledOn(habit, pauses, d("2026-11-13"))).toBe(true);
  });

  test("an open pause covers every later day", () => {
    const pauses = [pause("2026-11-10")];
    expect(isPausedOn(pauses, d("2030-01-01"))).toBe(true);
    expect(isPausedOn(pauses, d("2026-11-09"))).toBe(false);
  });

  test("a habit starting today is scheduled today", () => {
    expect(isScheduledOn(flexible(1, 1, "day", "2026-11-02"), [], d("2026-11-02"))).toBe(true);
    expect(isScheduledOn(onWeekdays([1], 1, "2026-11-02"), [], d("2026-11-02"))).toBe(true);
  });
});

describe("progressFor", () => {
  test("a 5-per-day habit needs 5 taps that day", () => {
    const habit = flexible(5, 1, "day");
    const checkins = taps({ "2026-11-01": 7, "2026-11-02": 4 });
    expect(progressFor(habit, checkins, d("2026-11-02"))).toMatchObject({
      done: 4,
      target: 5,
      complete: false,
    });
    expect(progressFor(habit, taps({ "2026-11-02": 5 }), d("2026-11-02")).complete).toBe(true);
  });

  test("a week's taps add up, and other weeks don't count", () => {
    const habit = flexible(3, 1, "week");
    const checkins = tapped("2026-10-31", "2026-11-02", "2026-11-04", "2026-11-08");
    expect(progressFor(habit, checkins, d("2026-11-05"))).toEqual({
      done: 2,
      target: 3,
      complete: false,
      period: period("2026-11-01", "2026-11-07"),
    });
  });

  test("taps before start_date don't count (a rule edit moved it)", () => {
    const habit = flexible(2, 1, "week", "2026-11-04");
    expect(progressFor(habit, tapped("2026-11-02", "2026-11-05"), d("2026-11-05")).done).toBe(1);
  });

  test("taps on paused days still count toward the period", () => {
    const habit = flexible(2, 1, "week");
    expect(progressFor(habit, tapped("2026-11-02", "2026-11-03"), d("2026-11-06")).complete).toBe(true);
  });

  test("specific days count only that day", () => {
    const habit = onWeekdays([1, 3], 2);
    const checkins = taps({ "2026-11-02": 2, "2026-11-04": 1 });
    expect(progressFor(habit, checkins, d("2026-11-02")).complete).toBe(true);
    expect(progressFor(habit, checkins, d("2026-11-04"))).toMatchObject({ done: 1, complete: false });
  });

  test("taps on the same day from two rows add up", () => {
    const index = indexCheckins(taps({ "2026-11-02": 1 }).concat(taps({ "2026-11-02": 2 })));
    expect(index.get(d("2026-11-02"))).toBe(3);
  });

  test("a monthly target over a leap February", () => {
    const habit = flexible(29, 1, "month", "2024-01-01");
    const days = Array.from({ length: 29 }, (_, i) => `2024-02-${String(i + 1).padStart(2, "0")}`);
    expect(progressFor(habit, tapped(...days), d("2024-02-15")).complete).toBe(true);
    expect(progressFor(habit, tapped(...days.slice(1)), d("2024-02-15")).complete).toBe(false);
  });
});

describe("dayStatus", () => {
  test("3× a week shows all week until the third tap, then is complete for the rest of it", () => {
    const habit = flexible(3, 1, "week");
    const two = tapped("2026-11-02", "2026-11-03");
    for (const day of ["2026-11-01", "2026-11-04", "2026-11-07"]) {
      expect(dayStatus(habit, [], two, d(day))).toBe("due");
    }
    const three = tapped("2026-11-02", "2026-11-03", "2026-11-04");
    for (const day of ["2026-11-01", "2026-11-04", "2026-11-05", "2026-11-07"]) {
      expect(dayStatus(habit, [], three, d(day))).toBe("complete");
    }
    expect(dayStatus(habit, [], three, d("2026-11-08"))).toBe("due");
  });

  test("not due before start_date, on paused days or off-schedule days", () => {
    expect(dayStatus(flexible(1, 1, "day", "2026-11-05"), [], [], d("2026-11-04"))).toBe("not_due");
    expect(dayStatus(flexible(1, 1, "day"), [pause("2026-11-01")], [], d("2026-11-04"))).toBe("not_due");
    expect(dayStatus(onWeekdays([1]), [], [], d("2026-11-03"))).toBe("not_due");
  });

  test("a paused day is not due even when its period is complete", () => {
    const habit = flexible(1, 1, "week");
    expect(dayStatus(habit, [pause("2026-11-04")], tapped("2026-11-02"), d("2026-11-05"))).toBe("not_due");
  });

  test("a habit starting today is due today", () => {
    expect(dayStatus(flexible(3, 1, "week", "2026-11-02"), [], [], d("2026-11-02"))).toBe("due");
  });
});

describe("streak (flexible)", () => {
  test("daily: consecutive days ending today", () => {
    const habit = flexible(1, 1, "day");
    const checkins = tapped("2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02");
    expect(streak(habit, [], checkins, d("2026-11-02"))).toBe(4);
  });

  test("an incomplete today doesn't break the streak", () => {
    const habit = flexible(1, 1, "day");
    expect(streak(habit, [], tapped("2026-10-31", "2026-11-01"), d("2026-11-02"))).toBe(2);
  });

  test("a missed day ends it", () => {
    const habit = flexible(1, 1, "day");
    expect(streak(habit, [], tapped("2026-10-30", "2026-11-01", "2026-11-02"), d("2026-11-02"))).toBe(2);
    expect(streak(habit, [], tapped("2026-10-30", "2026-10-31"), d("2026-11-02"))).toBe(0);
  });

  test("a count habit needs the full count each day", () => {
    const habit = flexible(5, 1, "day");
    const checkins = taps({ "2026-10-31": 5, "2026-11-01": 4, "2026-11-02": 6 });
    expect(streak(habit, [], checkins, d("2026-11-02"))).toBe(1);
  });

  test("weekly: counts weeks, the current one only once complete", () => {
    const habit = flexible(2, 1, "week");
    const checkins = tapped("2026-10-19", "2026-10-21", "2026-10-26", "2026-10-30", "2026-11-02");
    expect(streak(habit, [], checkins, d("2026-11-03"))).toBe(2);
    expect(streak(habit, [], [...checkins, ...tapped("2026-11-03")], d("2026-11-03"))).toBe(3);
  });

  test("never more than the periods since start_date; the partial first week counts if met", () => {
    const habit = flexible(1, 1, "week", "2026-10-28");
    expect(streak(habit, [], tapped("2026-10-29", "2026-11-02"), d("2026-11-02"))).toBe(2);
  });

  test("a habit starting today has no streak until it's met", () => {
    const habit = flexible(1, 1, "day", "2026-11-02");
    expect(streak(habit, [], [], d("2026-11-02"))).toBe(0);
    expect(streak(habit, [], tapped("2026-11-02"), d("2026-11-02"))).toBe(1);
  });

  test("before start_date there is nothing", () => {
    expect(streak(flexible(1, 1, "day", "2026-11-05"), [], [], d("2026-11-02"))).toBe(0);
  });

  test("paused days are skipped", () => {
    const habit = flexible(1, 1, "day");
    const checkins = tapped("2026-10-28", "2026-10-29", "2026-11-02");
    const pauses = [pause("2026-10-30", "2026-11-02")];
    expect(streak(habit, pauses, checkins, d("2026-11-02"))).toBe(3);
    expect(streak(habit, [], checkins, d("2026-11-02"))).toBe(1);
  });

  test("a pause spanning a week boundary skips both partly paused weeks", () => {
    const habit = flexible(3, 1, "week");
    const checkins = tapped(
      "2026-10-18", "2026-10-19", "2026-10-20", // week of Oct 18: met
      "2026-10-26", // week of Oct 25: paused from Thu, 1 of 3
      // week of Nov 1: paused until Wed, nothing yet
      "2026-11-09", "2026-11-10", "2026-11-11", // week of Nov 8: met
    );
    const pauses = [pause("2026-10-29", "2026-11-04")];
    expect(streak(habit, pauses, checkins, d("2026-11-12"))).toBe(2);
  });

  test("a complete period with paused days still counts", () => {
    const habit = flexible(2, 1, "week");
    const checkins = tapped("2026-10-26", "2026-10-27", "2026-11-02", "2026-11-03");
    expect(streak(habit, [pause("2026-10-28", "2026-10-30")], checkins, d("2026-11-03"))).toBe(2);
  });

  test("while paused (an open pause) the streak stays", () => {
    const habit = flexible(1, 1, "day");
    const checkins = tapped("2026-10-29", "2026-10-30");
    expect(streak(habit, [pause("2026-10-31")], checkins, d("2026-11-02"))).toBe(2);
  });

  test("5-day periods anchored mid-month", () => {
    const habit = flexible(2, 5, "day", "2026-10-17");
    // Periods: Oct 17–21, Oct 22–26, Oct 27–31, Nov 1–5.
    const checkins = tapped("2026-10-18", "2026-10-21", "2026-10-22", "2026-10-26", "2026-10-27", "2026-10-31");
    expect(streak(habit, [], checkins, d("2026-11-02"))).toBe(3);
    expect(streak(habit, [], checkins.slice(1), d("2026-11-02"))).toBe(2);
  });

  test("monthly periods", () => {
    const habit = flexible(2, 1, "month", "2026-08-15");
    const checkins = tapped("2026-08-20", "2026-08-30", "2026-09-01", "2026-09-02", "2026-10-05", "2026-10-06");
    expect(streak(habit, [], checkins, d("2026-11-02"))).toBe(3);
    expect(streak(habit, [], checkins.slice(2), d("2026-11-02"))).toBe(2);
  });
});

describe("streak (specific days)", () => {
  test("only scheduled days count; off days don't break it", () => {
    const habit = onWeekdays([1, 3, 5]); // Mon, Wed, Fri
    const checkins = tapped("2026-10-26", "2026-10-28", "2026-10-30", "2026-11-02");
    expect(streak(habit, [], checkins, d("2026-11-02"))).toBe(4);
    expect(streak(habit, [], checkins, d("2026-11-03"))).toBe(4); // Tue: nothing scheduled
  });

  test("today's unmet day doesn't break it, a missed past day does", () => {
    const habit = onWeekdays([1, 3, 5]);
    const checkins = tapped("2026-10-28", "2026-10-30");
    expect(streak(habit, [], checkins, d("2026-11-02"))).toBe(2); // Mon today, not yet
    expect(streak(habit, [], checkins, d("2026-11-03"))).toBe(0); // Mon was missed
  });

  test("needs target_count taps on each day", () => {
    const habit = onWeekdays([1, 3], 2);
    expect(streak(habit, [], taps({ "2026-10-28": 2, "2026-11-02": 1 }), d("2026-11-03"))).toBe(0);
    expect(streak(habit, [], taps({ "2026-10-28": 2, "2026-11-02": 3 }), d("2026-11-03"))).toBe(2);
  });

  test("paused scheduled days are skipped", () => {
    const habit = onWeekdays([1, 3, 5]);
    const checkins = tapped("2026-10-23", "2026-11-02");
    expect(streak(habit, [pause("2026-10-24", "2026-11-01")], checkins, d("2026-11-02"))).toBe(2);
  });

  test("the 31st habit walks through short months on their last day", () => {
    const habit = onMonthDays([31], 1, "2026-01-01");
    const checkins = tapped("2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30");
    expect(streak(habit, [], checkins, d("2026-05-15"))).toBe(4);
    expect(streak(habit, [], checkins.filter((c) => c.localDate !== "2026-02-28"), d("2026-05-15"))).toBe(2);
  });

  test("a leap-year February 29th", () => {
    const habit = onMonthDays([29], 1, "2024-01-01");
    expect(streak(habit, [], tapped("2024-01-29", "2024-02-29", "2024-03-29"), d("2024-03-30"))).toBe(3);
    expect(streak(habit, [], tapped("2024-01-29", "2024-02-28", "2024-03-29"), d("2024-03-30"))).toBe(1);
  });

  test("stops at start_date", () => {
    const habit = onWeekdays([0, 1, 2, 3, 4, 5, 6], 1, "2026-11-01");
    expect(streak(habit, [], tapped("2026-10-31", "2026-11-01", "2026-11-02"), d("2026-11-02"))).toBe(2);
  });
});

describe("describeSchedule", () => {
  test("flexible", () => {
    expect(describeSchedule(flexible(1, 1, "day"))).toBe("Every day");
    expect(describeSchedule(flexible(5, 1, "day"))).toBe("5 times a day");
    expect(describeSchedule(flexible(3, 1, "week"))).toBe("3 times a week");
    expect(describeSchedule(flexible(1, 1, "week"))).toBe("Once a week");
    expect(describeSchedule(flexible(2, 5, "day"))).toBe("Twice every 5 days");
    expect(describeSchedule(flexible(10, 1, "month"))).toBe("10 times a month");
    expect(describeSchedule(flexible(1, 2, "week"))).toBe("Once every 2 weeks");
    expect(describeSchedule(flexible(4, 3, "month"))).toBe("4 times every 3 months");
  });

  test("weekdays", () => {
    expect(describeSchedule(onWeekdays([1, 3, 5]))).toBe("Every Mon, Wed, Fri");
    expect(describeSchedule(onWeekdays([5, 1, 3]))).toBe("Every Mon, Wed, Fri");
    expect(describeSchedule(onWeekdays([1, 2, 3, 4, 5]))).toBe("Every weekday");
    expect(describeSchedule(onWeekdays([0, 6]))).toBe("Every weekend day");
    expect(describeSchedule(onWeekdays([0, 1, 2, 3, 4, 5, 6]))).toBe("Every day");
    expect(describeSchedule(onWeekdays([2], 2))).toBe("Every Tue, twice a day");
    expect(describeSchedule(onWeekdays([1, 4], 3))).toBe("Every Mon, Thu, 3 times a day");
  });

  test("month days", () => {
    expect(describeSchedule(onMonthDays([1]))).toBe("Every month on the 1st");
    expect(describeSchedule(onMonthDays([15, 1]))).toBe("Every month on the 1st and 15th");
    expect(describeSchedule(onMonthDays([1, 2, 3, 31], 2))).toBe(
      "Every month on the 1st, 2nd, 3rd and 31st, twice a day",
    );
  });

  test("ordinal", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 30, 31].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "30th", "31st",
    ]);
  });
});

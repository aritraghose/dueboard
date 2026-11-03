import {
  addDays,
  dayOfWeek,
  daysBetween,
  daysInMonth,
  monthsBetween,
  startOfMonth,
  startOfWeek,
  type LocalDate,
} from "./dates.ts";
import type {
  HabitDayStatus,
  HabitPeriodUnit,
  HabitSchedule,
  HabitScheduleKind,
} from "./model.ts";

// The habit rule engine (planning.md "Habits", architecture.md §4 "What
// shows on a given day"). Pure, no I/O: `habits.ts` loads the rows and asks
// these functions, and the browser can import them too. `LocalDate`s
// compare as strings.
//
// - Flexible: `targetCount` taps per period of `periodLength` ×
//   `periodUnit`. A 1-week period is a Sunday-to-Saturday week and a 1-month
//   period a calendar month; longer periods are anchored at `startDate`
//   (days and weeks start there; months start with its calendar month). The
//   habit is due every day of its period until the target is met, then
//   complete for the rest of it.
// - Specific days: due only on the listed weekdays or month days (a month
//   day past the month's end falls on its last day), `targetCount` taps each.
// - Never due before `startDate` or on a paused day. Progress is the whole
//   period's total, so every day of a met period reads as complete.

/** The columns the engine reads. Rows and `Habit` values both fit. */
export interface HabitRule {
  readonly scheduleKind: HabitScheduleKind;
  readonly targetCount: number;
  readonly periodUnit: HabitPeriodUnit;
  readonly periodLength: number;
  readonly weekdays: ReadonlyArray<number> | null;
  readonly monthDays: ReadonlyArray<number> | null;
  readonly startDate: LocalDate;
}

/** Covers `[startDate, endDate)`; open (`null`) while the habit is paused. */
export interface HabitPause {
  readonly startDate: LocalDate;
  readonly endDate: LocalDate | null;
}

export interface HabitCheckinCount {
  readonly localDate: LocalDate;
  readonly count: number;
}

export interface Period {
  readonly start: LocalDate;
  /** Inclusive. */
  readonly end: LocalDate;
}

export interface Progress {
  readonly done: number;
  readonly target: number;
  readonly complete: boolean;
}

// ─── Validation ──────────────────────────────────────────────────────────────

/** The rule columns a `HabitSchedule` input stores. */
export type ScheduleColumns = Pick<
  HabitRule,
  "scheduleKind" | "targetCount" | "periodUnit" | "periodLength" | "weekdays" | "monthDays"
>;

const sortedUnique = (days: ReadonlyArray<number>) => [...new Set(days)].sort((a, b) => a - b);

/**
 * The columns for `schedule`, or a message saying what's wrong with it.
 * Days are deduplicated and sorted; specific-days habits store `day` × 1.
 */
export const normalizeSchedule = (
  schedule: HabitSchedule,
): { readonly ok: true; readonly columns: ScheduleColumns } | { readonly ok: false; readonly message: string } => {
  const weekdays = schedule.weekdays?.length ? sortedUnique(schedule.weekdays) : null;
  const monthDays = schedule.monthDays?.length ? sortedUnique(schedule.monthDays) : null;
  if (schedule.kind === "flexible") {
    if (weekdays || monthDays) {
      return { ok: false, message: "A flexible habit can't have specific days." };
    }
    if (schedule.periodUnit === undefined || schedule.periodLength === undefined) {
      return { ok: false, message: "A flexible habit needs a period." };
    }
    return {
      ok: true,
      columns: {
        scheduleKind: "flexible",
        targetCount: schedule.targetCount,
        periodUnit: schedule.periodUnit,
        periodLength: schedule.periodLength,
        weekdays: null,
        monthDays: null,
      },
    };
  }
  if ((weekdays === null) === (monthDays === null)) {
    return { ok: false, message: "Pick either weekdays or days of the month." };
  }
  return {
    ok: true,
    columns: {
      scheduleKind: "specific_days",
      targetCount: schedule.targetCount,
      periodUnit: "day",
      periodLength: 1,
      weekdays,
      monthDays,
    },
  };
};

// ─── Days and periods ────────────────────────────────────────────────────────

const floorDiv = (a: number, b: number) => Math.floor(a / b);

/** Whether `date` falls in one of `pauses`. */
export const isPausedOn = (pauses: ReadonlyArray<HabitPause>, date: LocalDate): boolean =>
  pauses.some((p) => p.startDate <= date && (p.endDate === null || date < p.endDate));

/** Whether the specific-days rule names `date`, pauses and `startDate` aside. */
const matchesDays = (habit: HabitRule, date: LocalDate): boolean => {
  if (habit.weekdays) return habit.weekdays.includes(dayOfWeek(date));
  if (habit.monthDays) {
    const day = Number(date.slice(8));
    const last = daysInMonth(date);
    return habit.monthDays.some((d) => d === day || (day === last && d > last));
  }
  return false;
};

/**
 * The period containing `date`: for flexible habits per the rule above (also
 * before `startDate`, extending the anchoring backwards), and the day itself
 * for specific-days habits.
 */
export const periodFor = (habit: HabitRule, date: LocalDate): Period => {
  if (habit.scheduleKind === "specific_days") return { start: date, end: date };
  const length = habit.periodLength;
  switch (habit.periodUnit) {
    case "day":
    case "week": {
      if (habit.periodUnit === "week" && length === 1) {
        const start = startOfWeek(date);
        return { start, end: addDays(start, 6) };
      }
      const days = habit.periodUnit === "week" ? length * 7 : length;
      const start = addDays(habit.startDate, floorDiv(daysBetween(habit.startDate, date), days) * days);
      return { start, end: addDays(start, days - 1) };
    }
    case "month": {
      const offset = floorDiv(monthsBetween(habit.startDate, date), length) * length;
      const start = startOfMonth(habit.startDate, offset);
      return { start, end: addDays(startOfMonth(start, length), -1) };
    }
  }
};

/**
 * Whether the habit can be due on `date`: on or after `startDate`, not
 * paused, and (for specific days) one of its days. A flexible habit is
 * scheduled every day; whether it's still due depends on its progress.
 */
export const isScheduledOn = (
  habit: HabitRule,
  pauses: ReadonlyArray<HabitPause>,
  date: LocalDate,
): boolean =>
  date >= habit.startDate &&
  !isPausedOn(pauses, date) &&
  (habit.scheduleKind === "flexible" || matchesDays(habit, date));

// ─── Progress ────────────────────────────────────────────────────────────────

/** Taps per day. Build it once and pass it to the functions below. */
export type CheckinIndex = ReadonlyMap<LocalDate, number>;

export const indexCheckins = (checkins: ReadonlyArray<HabitCheckinCount>): CheckinIndex => {
  const index = new Map<LocalDate, number>();
  for (const { localDate, count } of checkins) {
    index.set(localDate, (index.get(localDate) ?? 0) + count);
  }
  return index;
};

const toIndex = (checkins: ReadonlyArray<HabitCheckinCount> | CheckinIndex): CheckinIndex =>
  checkins instanceof Map ? checkins : indexCheckins(checkins as ReadonlyArray<HabitCheckinCount>);

/**
 * The days of `period` that count: from `startDate` on (check-ins kept from
 * before a rule edit moved it don't count), or `null` when the period ends
 * before it.
 */
const countedSpan = (habit: HabitRule, period: Period): Period | null => {
  const start = period.start < habit.startDate ? habit.startDate : period.start;
  return start > period.end ? null : { start, end: period.end };
};

const tapsIn = (habit: HabitRule, index: CheckinIndex, period: Period): number => {
  const span = countedSpan(habit, period);
  if (!span) return 0;
  let done = 0;
  for (let day = span.start; day <= span.end; day = addDays(day, 1)) done += index.get(day) ?? 0;
  return done;
};

const progressIn = (habit: HabitRule, index: CheckinIndex, period: Period): Progress => {
  const done = tapsIn(habit, index, period);
  return { done, target: habit.targetCount, complete: done >= habit.targetCount };
};

/**
 * Taps in the period (flexible) or on the day (specific days) containing
 * `date`, against the target. Taps on paused days still count.
 */
export const progressFor = (
  habit: HabitRule,
  checkins: ReadonlyArray<HabitCheckinCount> | CheckinIndex,
  date: LocalDate,
): Progress & { readonly period: Period } => {
  const period = periodFor(habit, date);
  return { ...progressIn(habit, toIndex(checkins), period), period };
};

/** `not_due` when the habit isn't scheduled on `date`; otherwise whether its period's target is met. */
export const dayStatus = (
  habit: HabitRule,
  pauses: ReadonlyArray<HabitPause>,
  checkins: ReadonlyArray<HabitCheckinCount> | CheckinIndex,
  date: LocalDate,
): HabitDayStatus => {
  if (!isScheduledOn(habit, pauses, date)) return "not_due";
  return progressFor(habit, checkins, date).complete ? "complete" : "due";
};

// ─── Streaks ─────────────────────────────────────────────────────────────────

/** Whether any day of `span` is paused. */
const touchesPause = (pauses: ReadonlyArray<HabitPause>, span: Period): boolean =>
  pauses.some((p) => p.startDate <= span.end && (p.endDate === null || p.endDate > span.start));

/** The latest day on or before `date` that the specific-days rule names, not before `startDate`. */
const previousMatch = (habit: HabitRule, date: LocalDate): LocalDate | null => {
  for (let day = date; day >= habit.startDate; day = addDays(day, -1)) {
    if (matchesDays(habit, day)) return day;
  }
  return null;
};

/**
 * Consecutive completed periods (flexible) or scheduled days (specific
 * days), ending at the one containing `today`. Walking back from there:
 *
 * - a complete period counts (even one with paused days);
 * - the current one doesn't break the streak while it's incomplete;
 * - an incomplete period with a paused day is skipped (pauses never break a
 *   streak);
 * - any other incomplete period, or reaching `startDate`, ends it.
 */
export const streak = (
  habit: HabitRule,
  pauses: ReadonlyArray<HabitPause>,
  checkins: ReadonlyArray<HabitCheckinCount> | CheckinIndex,
  today: LocalDate,
): number => {
  const index = toIndex(checkins);
  let count = 0;
  if (habit.scheduleKind === "flexible") {
    for (let period = periodFor(habit, today); ; period = periodFor(habit, addDays(period.start, -1))) {
      const span = countedSpan(habit, period);
      if (!span) return count;
      if (progressIn(habit, index, period).complete) count += 1;
      else if (period.end < today && !touchesPause(pauses, span)) return count;
    }
  }
  for (let day = previousMatch(habit, today); day; day = previousMatch(habit, addDays(day, -1))) {
    if ((index.get(day) ?? 0) >= habit.targetCount) count += 1;
    else if (day < today && !isPausedOn(pauses, day)) return count;
  }
  return count;
};

// ─── Upcoming ────────────────────────────────────────────────────────────────

/** A day the Upcoming list shows a habit on, with the period it stands for. */
export interface Occurrence extends Progress {
  readonly date: LocalDate;
  readonly period: Period;
}

/**
 * The days in `[from, until)` the Upcoming list shows the habit on. Specific
 * days: every scheduled day. Flexible: once per period, on its first
 * scheduled day in the range (so "3 times a week" shows once a week, and a
 * daily count every day). Periods whose target is already met are left out.
 */
export const occurrences = (
  habit: HabitRule,
  pauses: ReadonlyArray<HabitPause>,
  checkins: ReadonlyArray<HabitCheckinCount> | CheckinIndex,
  from: LocalDate,
  until: LocalDate,
): Array<Occurrence> => {
  const index = toIndex(checkins);
  const result: Array<Occurrence> = [];
  let shownPeriod: LocalDate | null = null;
  for (let day = from; day < until; day = addDays(day, 1)) {
    if (!isScheduledOn(habit, pauses, day)) continue;
    const period = periodFor(habit, day);
    if (period.start === shownPeriod) continue;
    shownPeriod = period.start;
    const progress = progressIn(habit, index, period);
    if (!progress.complete) result.push({ ...progress, date: day, period });
  }
  return result;
};

// ─── Wording ─────────────────────────────────────────────────────────────────

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const UNIT_NOUN: Record<HabitPeriodUnit, string> = { day: "day", week: "week", month: "month" };

const times = (n: number) => (n === 1 ? "Once" : n === 2 ? "Twice" : `${n} times`);

/** 1st, 2nd, 3rd, 4th, 11th, 21st … */
export const ordinal = (n: number): string => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
};

/** "a, b and c". */
const listing = (items: ReadonlyArray<string>) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

/**
 * The rule as a sentence, for the UI and Tibo: "Every day", "5 times a day",
 * "3 times a week", "Twice every 5 days", "Once every 2 weeks", "Every Mon,
 * Wed, Fri", "Every weekday, twice a day", "Every month on the 1st and 15th".
 */
export const describeSchedule = (habit: Omit<HabitRule, "startDate">): string => {
  const n = habit.targetCount;
  if (habit.scheduleKind === "flexible") {
    const unit = UNIT_NOUN[habit.periodUnit];
    if (habit.periodLength === 1) {
      if (habit.periodUnit === "day" && n === 1) return "Every day";
      return `${times(n)} a ${unit}`;
    }
    return `${times(n)} every ${habit.periodLength} ${unit}s`;
  }
  const perDay = n === 1 ? "" : `, ${times(n).toLowerCase()} a day`;
  if (habit.weekdays) {
    const days = sortedUnique(habit.weekdays);
    const key = days.join("");
    const named =
      key === "0123456"
        ? "Every day"
        : key === "12345"
          ? "Every weekday"
          : key === "06"
            ? "Every weekend day"
            : `Every ${days.map((d) => WEEKDAY_SHORT[d]).join(", ")}`;
    return named + perDay;
  }
  const days = sortedUnique(habit.monthDays ?? []);
  return `Every month on the ${listing(days.map(ordinal))}${perDay}`;
};

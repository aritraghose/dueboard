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

export interface HabitRule {
  readonly scheduleKind: HabitScheduleKind;
  readonly targetCount: number;
  readonly periodUnit: HabitPeriodUnit;
  readonly periodLength: number;
  readonly weekdays: ReadonlyArray<number> | null;
  readonly monthDays: ReadonlyArray<number> | null;
  readonly startDate: LocalDate;
}

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
  readonly end: LocalDate;
}

export interface Progress {
  readonly done: number;
  readonly target: number;
  readonly complete: boolean;
}

export type ScheduleColumns = Pick<
  HabitRule,
  "scheduleKind" | "targetCount" | "periodUnit" | "periodLength" | "weekdays" | "monthDays"
>;

const sortedUnique = (days: ReadonlyArray<number>) => [...new Set(days)].sort((a, b) => a - b);

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

const floorDiv = (a: number, b: number) => Math.floor(a / b);

export const isPausedOn = (pauses: ReadonlyArray<HabitPause>, date: LocalDate): boolean =>
  pauses.some((p) => p.startDate <= date && (p.endDate === null || date < p.endDate));

const matchesDays = (habit: HabitRule, date: LocalDate): boolean => {
  if (habit.weekdays) return habit.weekdays.includes(dayOfWeek(date));
  if (habit.monthDays) {
    const day = Number(date.slice(8));
    const last = daysInMonth(date);
    return habit.monthDays.some((d) => d === day || (day === last && d > last));
  }
  return false;
};

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

export const isScheduledOn = (
  habit: HabitRule,
  pauses: ReadonlyArray<HabitPause>,
  date: LocalDate,
): boolean =>
  date >= habit.startDate &&
  !isPausedOn(pauses, date) &&
  (habit.scheduleKind === "flexible" || matchesDays(habit, date));

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

export const progressFor = (
  habit: HabitRule,
  checkins: ReadonlyArray<HabitCheckinCount> | CheckinIndex,
  date: LocalDate,
): Progress & { readonly period: Period } => {
  const period = periodFor(habit, date);
  return { ...progressIn(habit, toIndex(checkins), period), period };
};

export const dayStatus = (
  habit: HabitRule,
  pauses: ReadonlyArray<HabitPause>,
  checkins: ReadonlyArray<HabitCheckinCount> | CheckinIndex,
  date: LocalDate,
): HabitDayStatus => {
  if (!isScheduledOn(habit, pauses, date)) return "not_due";
  return progressFor(habit, checkins, date).complete ? "complete" : "due";
};

const touchesPause = (pauses: ReadonlyArray<HabitPause>, span: Period): boolean =>
  pauses.some((p) => p.startDate <= span.end && (p.endDate === null || p.endDate > span.start));

const previousMatch = (habit: HabitRule, date: LocalDate): LocalDate | null => {
  for (let day = date; day >= habit.startDate; day = addDays(day, -1)) {
    if (matchesDays(habit, day)) return day;
  }
  return null;
};

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

export interface Occurrence extends Progress {
  readonly date: LocalDate;
  readonly period: Period;
}

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

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const UNIT_NOUN: Record<HabitPeriodUnit, string> = { day: "day", week: "week", month: "month" };

const times = (n: number) => (n === 1 ? "Once" : n === 2 ? "Twice" : `${n} times`);

export const ordinal = (n: number): string => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
};

const listing = (items: ReadonlyArray<string>) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

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

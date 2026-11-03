import {
  HABIT_CHECKIN_DAYS_BACK,
  type Habit,
  type HabitPeriodUnit,
  type HabitSchedule,
  describeSchedule,
} from "@dueboard/api/rpc";
import { type LocalDate, addDays, daysBetween, formatDay } from "@/lib/dates";

// Display helpers for habits. The rules (what's due, progress, streaks)
// live in the API's `habit-rules.ts`; the schedule sentence is its
// `describeSchedule`, imported here so the builder's preview and the saved
// habit always read the same.

export { describeSchedule };

// ─── Schedule presets ────────────────────────────────────────────────────────

export const SCHEDULE_PRESETS = [
  "daily",
  "times_a_day",
  "times_a_week",
  "every_n_days",
  "weekdays",
  "month_days",
  "times_a_month",
  "custom",
] as const;
export type SchedulePreset = (typeof SCHEDULE_PRESETS)[number];

export const PRESET_LABEL: Record<SchedulePreset, string> = {
  daily: "Daily",
  times_a_day: "Times a day",
  times_a_week: "Times a week",
  every_n_days: "Every few days",
  weekdays: "On weekdays",
  month_days: "On month days",
  times_a_month: "Times a month",
  custom: "Custom",
};

/** Everything the builder edits. Each preset reads only the fields it needs. */
export type ScheduleDraft = {
  readonly preset: SchedulePreset;
  /** Taps per period (flexible) or per scheduled day (specific days). */
  readonly count: number;
  /** "Every N days" and Custom. */
  readonly length: number;
  /** Custom only. */
  readonly unit: HabitPeriodUnit;
  readonly weekdays: readonly number[];
  readonly monthDays: readonly number[];
};

export const DEFAULT_DRAFT: ScheduleDraft = {
  preset: "daily",
  count: 1,
  length: 2,
  unit: "week",
  weekdays: [1, 3, 5],
  monthDays: [1, 15],
};

/** The draft a preset starts from, keeping what carries over (days, counts). */
export const withPreset = (draft: ScheduleDraft, preset: SchedulePreset): ScheduleDraft => {
  switch (preset) {
    case "times_a_day":
    case "times_a_week":
    case "times_a_month":
      // "N times" reads best from 2 up; keep a count the user already set.
      return { ...draft, preset, count: Math.max(draft.count, preset === "times_a_day" ? 2 : 3) };
    case "every_n_days":
      return { ...draft, preset, length: Math.max(draft.length, 2) };
    default:
      return { ...draft, preset };
  }
};

/** The `HabitSchedule` the API stores for a draft. */
export const toSchedule = (draft: ScheduleDraft): HabitSchedule => {
  const flexible = (targetCount: number, periodUnit: HabitPeriodUnit, periodLength: number): HabitSchedule => ({
    kind: "flexible",
    targetCount,
    periodUnit,
    periodLength,
  });
  switch (draft.preset) {
    case "daily":
      return flexible(1, "day", 1);
    case "times_a_day":
      return flexible(draft.count, "day", 1);
    case "times_a_week":
      return flexible(draft.count, "week", 1);
    case "times_a_month":
      return flexible(draft.count, "month", 1);
    case "every_n_days":
      return flexible(1, "day", draft.length);
    case "custom":
      return flexible(draft.count, draft.unit, draft.length);
    case "weekdays":
      return { kind: "specific_days", targetCount: draft.count, weekdays: [...draft.weekdays].sort((a, b) => a - b) };
    case "month_days":
      return { kind: "specific_days", targetCount: draft.count, monthDays: [...draft.monthDays].sort((a, b) => a - b) };
  }
};

/** The builder's state for a saved habit: the preset that fits its rule, or Custom. */
export const draftFor = (habit: Habit): ScheduleDraft => {
  const base = { ...DEFAULT_DRAFT, count: habit.targetCount };
  if (habit.scheduleKind === "specific_days") {
    return habit.weekdays
      ? { ...base, preset: "weekdays", weekdays: habit.weekdays }
      : { ...base, preset: "month_days", monthDays: habit.monthDays ?? [] };
  }
  const { periodUnit: unit, periodLength: length, targetCount: count } = habit;
  if (length === 1 && unit === "day") return { ...base, preset: count === 1 ? "daily" : "times_a_day" };
  if (length === 1 && unit === "week") return { ...base, preset: "times_a_week" };
  if (length === 1 && unit === "month") return { ...base, preset: "times_a_month" };
  if (unit === "day" && count === 1) return { ...base, preset: "every_n_days", length };
  return { ...base, preset: "custom", unit, length };
};

/** What's missing from a draft before it can be saved, or `null`. */
export const draftProblem = (draft: ScheduleDraft): string | null => {
  if (draft.preset === "weekdays" && draft.weekdays.length === 0) return "Pick at least one weekday.";
  if (draft.preset === "month_days" && draft.monthDays.length === 0) return "Pick at least one day of the month.";
  return null;
};

/** The draft as the sentence the habit will show ("3 times a week"). */
export const describeDraft = (draft: ScheduleDraft): string => {
  const schedule = toSchedule(draft);
  return describeSchedule({
    scheduleKind: schedule.kind,
    targetCount: schedule.targetCount,
    periodUnit: schedule.periodUnit ?? "day",
    periodLength: schedule.periodLength ?? 1,
    weekdays: schedule.weekdays ?? null,
    monthDays: schedule.monthDays ?? null,
  });
};

// ─── Progress wording ────────────────────────────────────────────────────────

/**
 * Where a flexible habit stands in its period, for the card: "2 of 3 this
 * week", "3 of 5 today", "1 of 2 by Fri, Nov 6". Specific-days habits count
 * the day itself.
 */
export const progressHint = (
  habit: Habit,
  progress: {
    readonly done: number;
    readonly target: number;
    readonly periodStart: LocalDate;
    readonly periodEnd: LocalDate;
  },
  today: LocalDate,
): string => {
  const count = `${progress.done} of ${progress.target}`;
  // "This week" while today is in the period shown, "that week" otherwise
  // (for a day, the period is the day itself).
  const current = progress.periodStart <= today && today <= progress.periodEnd;
  if (habit.scheduleKind === "specific_days" || (habit.periodUnit === "day" && habit.periodLength === 1)) {
    return `${count} ${current ? "today" : "that day"}`;
  }
  if (habit.periodLength === 1) return `${count} ${current ? "this" : "that"} ${habit.periodUnit}`;
  return `${count} by ${formatDay(progress.periodEnd, today)}`;
};

/**
 * What a habit asks for on an Upcoming day: "3 this week", "1 more this
 * month", "2 by Tue, Nov 10" (flexible habits show once per period), "5
 * times" for a count on the day, or `null` for a single tap that day.
 */
export const upcomingHint = (
  habit: Habit,
  progress: { readonly done: number; readonly target: number; readonly periodEnd: LocalDate },
  today: LocalDate,
): string | null => {
  if (habit.scheduleKind === "specific_days" || (habit.periodUnit === "day" && habit.periodLength === 1)) {
    return progress.target > 1 ? `${progress.target} times` : null;
  }
  const left = progress.target - progress.done;
  const amount = progress.done > 0 ? `${left} more` : String(progress.target);
  if (habit.periodLength === 1) return `${amount} this ${habit.periodUnit}`;
  return `${amount} by ${formatDay(progress.periodEnd, today)}`;
};

/** Whether `date` takes check-ins: today or up to 30 days back, like the API. */
export const checkInWindow = (date: LocalDate, today: LocalDate): "open" | "future" | "too_old" =>
  date > today ? "future" : daysBetween(date, today) > HABIT_CHECKIN_DAYS_BACK ? "too_old" : "open";

/** The oldest day that still takes check-ins. */
export const oldestCheckInDay = (today: LocalDate): LocalDate => addDays(today, -HABIT_CHECKIN_DAYS_BACK);

/** "1 day", "12 days" for a flexible period, "1 week", … */
export const streakUnit = (habit: Habit, streak: number): string => {
  const unit =
    habit.scheduleKind === "specific_days" || (habit.periodUnit === "day" && habit.periodLength === 1)
      ? "day"
      : habit.periodLength === 1
        ? habit.periodUnit
        : "period";
  return `${streak} ${unit}${streak === 1 ? "" : "s"}`;
};

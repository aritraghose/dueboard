import * as Schema from "effect/Schema";
import { LocalDate } from "../core/dates.ts";
import { Id, Privacy } from "../core/model.ts";

export const HABIT_SCHEDULE_KIND = ["flexible", "specific_days"] as const;
export const HabitScheduleKind = Schema.Literals(HABIT_SCHEDULE_KIND);
export type HabitScheduleKind = typeof HabitScheduleKind.Type;

export const HABIT_PERIOD_UNIT = ["day", "week", "month"] as const;
export const HabitPeriodUnit = Schema.Literals(HABIT_PERIOD_UNIT);
export type HabitPeriodUnit = typeof HabitPeriodUnit.Type;

export const HABIT_STATUS = ["active", "paused", "archived"] as const;
export const HabitStatus = Schema.Literals(HABIT_STATUS);
export type HabitStatus = typeof HabitStatus.Type;

export const HABIT_DAY_STATUS = ["not_due", "due", "complete"] as const;
export const HabitDayStatus = Schema.Literals(HABIT_DAY_STATUS);
export type HabitDayStatus = typeof HabitDayStatus.Type;

export const HABIT_TITLE_MAX_LENGTH = 200;
export const HABIT_DESCRIPTION_MAX_LENGTH = 2000;
export const HABIT_TARGET_MAX = 100;
export const HABIT_PERIOD_LENGTH_MAX = 365;
export const HABIT_CHECKIN_DAYS_BACK = 30;
export const HABIT_HISTORY_WEEKS = 12;

export const HabitTitle = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isBetweenLength(1, HABIT_TITLE_MAX_LENGTH),
);
export const HabitDescription = Schema.String.check(Schema.isMaxLength(HABIT_DESCRIPTION_MAX_LENGTH));

export const HabitSchedule = Schema.Struct({
  kind: HabitScheduleKind,
  targetCount: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: HABIT_TARGET_MAX })),
  periodUnit: Schema.optionalKey(HabitPeriodUnit),
  periodLength: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: HABIT_PERIOD_LENGTH_MAX })),
  ),
  weekdays: Schema.optionalKey(
    Schema.NullOr(
      Schema.Array(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 6 }))).check(
        Schema.isMaxLength(7),
      ),
    ),
  ),
  monthDays: Schema.optionalKey(
    Schema.NullOr(
      Schema.Array(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 31 }))).check(
        Schema.isMaxLength(31),
      ),
    ),
  ),
});
export type HabitSchedule = typeof HabitSchedule.Type;

export const CreateHabitInput = Schema.Struct({
  title: HabitTitle,
  description: Schema.optionalKey(Schema.NullOr(HabitDescription)),
  schedule: HabitSchedule,
  startDate: Schema.optionalKey(LocalDate),
  privacy: Schema.optionalKey(Privacy),
  shareToLive: Schema.optionalKey(Schema.Boolean),
});
export type CreateHabitInput = typeof CreateHabitInput.Type;

export const UpdateHabitInput = Schema.Struct({
  id: Id,
  title: Schema.optionalKey(HabitTitle),
  description: Schema.optionalKey(Schema.NullOr(HabitDescription)),
  schedule: Schema.optionalKey(HabitSchedule),
  startDate: Schema.optionalKey(LocalDate),
  privacy: Schema.optionalKey(Privacy),
  shareToLive: Schema.optionalKey(Schema.Boolean),
});
export type UpdateHabitInput = typeof UpdateHabitInput.Type;

export const HabitCheckInInput = Schema.Struct({ id: Id, date: LocalDate });
export type HabitCheckInInput = typeof HabitCheckInInput.Type;

export class Habit extends Schema.Class<Habit>("Habit")({
  id: Schema.String,
  title: Schema.String,
  description: Schema.NullOr(Schema.String),
  scheduleKind: HabitScheduleKind,
  targetCount: Schema.Number,
  periodUnit: HabitPeriodUnit,
  periodLength: Schema.Number,
  weekdays: Schema.NullOr(Schema.Array(Schema.Number)),
  monthDays: Schema.NullOr(Schema.Array(Schema.Number)),
  startDate: LocalDate,
  status: HabitStatus,
  privacy: Privacy,
  shareToLive: Schema.Boolean,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}

export class HabitProgress extends Schema.Class<HabitProgress>("HabitProgress")({
  periodStart: LocalDate,
  periodEnd: LocalDate,
  done: Schema.Number,
  target: Schema.Number,
  complete: Schema.Boolean,
}) {}

export class HabitCheckin extends Schema.Class<HabitCheckin>("HabitCheckin")({
  date: LocalDate,
  count: Schema.Number,
}) {}

export class HabitOnDay extends Schema.Class<HabitOnDay>("HabitOnDay")({
  habit: Habit,
  schedule: Schema.String,
  date: LocalDate,
  status: HabitDayStatus,
  progress: HabitProgress,
  countOnDay: Schema.Number,
  streak: Schema.Number,
}) {}

export class HabitsForDay extends Schema.Class<HabitsForDay>("HabitsForDay")({
  date: LocalDate,
  due: Schema.Array(HabitOnDay),
  settled: Schema.Array(HabitOnDay),
  allChecked: Schema.Boolean,
}) {}

export class HabitSummary extends Schema.Class<HabitSummary>("HabitSummary")({
  habit: Habit,
  schedule: Schema.String,
  streak: Schema.Number,
  progress: HabitProgress,
  history: Schema.Array(HabitCheckin),
}) {}

export class HabitNotFound extends Schema.TaggedError<HabitNotFound>()("HabitNotFound", {
  message: Schema.String,
  id: Schema.String,
}) {}

export const CHECK_IN_REFUSAL = ["future", "too_old", "not_due", "not_active"] as const;
export type CheckInRefusal = (typeof CHECK_IN_REFUSAL)[number];

export class CheckInNotAllowed extends Schema.TaggedError<CheckInNotAllowed>()("CheckInNotAllowed", {
  message: Schema.String,
  reason: Schema.Literals(CHECK_IN_REFUSAL),
}) {}

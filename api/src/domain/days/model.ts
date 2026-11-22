import * as Schema from "effect/Schema";
import { LocalDate } from "../core/dates.ts";
import { Goal, GoalsForDay } from "../goals/model.ts";
import { Habit, HabitProgress, HabitsForDay } from "../habits/model.ts";
import { SessionsForDay } from "../sessions/model.ts";
import { DayTask, TasksForDay, UnscheduledTasks } from "../tasks/model.ts";

export const UPCOMING_DAYS_MAX = 60;

export const GetUpcomingInput = Schema.Struct({
  from: LocalDate,
  days: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: UPCOMING_DAYS_MAX })),
});
export type GetUpcomingInput = typeof GetUpcomingInput.Type;

export class Day extends Schema.Class<Day>("Day")({
  date: LocalDate,
  tasks: TasksForDay,
  unscheduled: UnscheduledTasks,
  habits: HabitsForDay,
  goals: GoalsForDay,
  sessions: SessionsForDay,
  notesCount: Schema.Number,
}) {}

export class UpcomingHabit extends Schema.Class<UpcomingHabit>("UpcomingHabit")({
  habit: Habit,
  schedule: Schema.String,
  progress: HabitProgress,
}) {}

export class UpcomingDay extends Schema.Class<UpcomingDay>("UpcomingDay")({
  date: LocalDate,
  tasks: Schema.Array(DayTask),
  habits: Schema.Array(UpcomingHabit),
  goals: Schema.Array(Goal),
}) {}

export class Upcoming extends Schema.Class<Upcoming>("Upcoming")({
  from: LocalDate,
  until: LocalDate,
  days: Schema.Array(UpcomingDay),
}) {}

import * as Context from "effect/Context";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";
import * as RpcMiddleware from "effect/rpc/RpcMiddleware";
import * as Schema from "effect/Schema";
import { LocalDate } from "./domain/dates.ts";
import {
  ActiveSessionExists,
  AdjustGoalProgressInput,
  CheckInNotAllowed,
  CreateGoalInput,
  CreateHabitInput,
  CreateNoteInput,
  CreateTagInput,
  CreateTaskInput,
  Day,
  ExtendSessionInput,
  FocusSession,
  Goal,
  GoalItemRef,
  GoalLink,
  GoalNotFound,
  GoalSummary,
  GoalsForDay,
  GetUpcomingInput,
  Habit,
  HabitCheckInInput,
  HabitNotFound,
  HabitOnDay,
  HabitSummary,
  HabitsForDay,
  Id,
  InvalidInput,
  ItemGoal,
  LinkGoalItemInput,
  Note,
  NoteLimitReached,
  NoteNotFound,
  NotePage,
  NotesForDay,
  ListGoalsInput,
  ListNotesInput,
  ListSessionsInput,
  ListTasksInput,
  ListUnscheduledTasksInput,
  SetGoalProgressInput,
  SessionNotFound,
  SessionPage,
  SessionTransitionNotAllowed,
  SessionsForDay,
  SetTaskStatusInput,
  Settings,
  SettingsPatch,
  StartSessionInput,
  SystemTagLocked,
  TIME_ZONE_MAX_LENGTH,
  Tag,
  TagLimitReached,
  TagNameTaken,
  TagNotFound,
  Task,
  TaskNotFound,
  TaskPage,
  TasksForDay,
  UnlinkGoalItemInput,
  UnscheduledTasks,
  Upcoming,
  UpdateGoalInput,
  UpdateHabitInput,
  UpdateNoteInput,
  UpdateTagInput,
  UpdateTaskInput,
} from "./domain/model.ts";

// The domain's values, inputs and errors, for the browser.
export * from "./domain/model.ts";
export { LocalDate, addDays, localDateOf, startOfWeek, todayIn } from "./domain/dates.ts";
// The pure session rules, so the UI counts time exactly as the API does.
export { computeEndsAt, elapsed, remaining } from "./domain/session-rules.ts";
// The pure goal rules, so the UI shows percents exactly as the API does.
export { goalPercent, goalValue, isReached } from "./domain/goal-rules.ts";
// The pure habit engine, so the UI words and computes schedules like the API.
export {
  dayStatus,
  describeSchedule,
  isScheduledOn,
  periodFor,
  progressFor,
  streak,
} from "./domain/habit-rules.ts";

/**
 * Shared domain + RPC contract.
 *
 * This module is the single source of truth imported by BOTH ends:
 *   - the `ApiWorker` RpcWorker ({@link ./api.ts}) serves it, and
 *   - the browser `AtomRpc` client (`web/src/rpc-client.ts`) consumes it via
 *     the `@dueboard/api/rpc` export.
 *
 * One `Schema` codec round-trips every value over the wire, so the React UI is
 * fully typed against the same shapes the Postgres-backed handlers return.
 */

/** The signed-in, onboarded user an RPC runs as. Provided by {@link Authentication}. */
export class CurrentUser extends Context.Service<
  CurrentUser,
  { readonly id: string; readonly username: string }
>()("api/CurrentUser") {}

/** Raised when the request has no session, or its user hasn't picked a username yet. */
export class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {
  message: Schema.String,
}) {}

/** Raised when a user sends more RPCs than their per-minute budget allows. */
export class TooManyRequests extends Schema.TaggedError<TooManyRequests>()("TooManyRequests", {
  message: Schema.String,
}) {}

/**
 * Resolves the Better Auth session from the request's cookies, applies the
 * user's rate limit, and provides {@link CurrentUser} to every RPC.
 * Implemented in `./api.ts`.
 */
export class Authentication extends RpcMiddleware.Service<
  Authentication,
  { provides: CurrentUser }
>()("api/Authentication", { error: Schema.Union([Unauthorized, TooManyRequests]) }) {}

/** What the app loads on start: the user's settings and tags. */
export class BootstrapResult extends Schema.Class<BootstrapResult>("BootstrapResult")({
  settings: Settings,
  tags: Schema.Array(Tag),
}) {}

/**
 * Every RPC the API serves. Add each new procedure here with `Rpc.make(...)`
 * and implement it in `./api.ts`, as a thin call into a domain service
 * (`./domain/`). The middleware runs every RPC as the signed-in, onboarded
 * user.
 */
export class ApiRpcs extends RpcGroup.make(
  /**
   * Run by the `_app` layout on every app load with the browser's IANA zone.
   * Creates the settings row and system tags if missing (this also
   * backfills older accounts) and saves the zone when it changed.
   */
  Rpc.make("Bootstrap", {
    payload: { timeZone: Schema.String.check(Schema.isMaxLength(TIME_ZONE_MAX_LENGTH)) },
    success: BootstrapResult,
  }),
  Rpc.make("UpdateSettings", {
    payload: SettingsPatch,
    success: Settings,
    error: InvalidInput,
  }),
  Rpc.make("ListTags", {
    success: Schema.Array(Tag),
  }),
  Rpc.make("CreateTag", {
    payload: CreateTagInput,
    success: Tag,
    error: Schema.Union([InvalidInput, TagNameTaken, TagLimitReached]),
  }),
  Rpc.make("UpdateTag", {
    payload: UpdateTagInput,
    success: Tag,
    error: Schema.Union([InvalidInput, TagNotFound, TagNameTaken, SystemTagLocked]),
  }),
  /** Deletes one of the user's own tags and returns its id. Its items move to `default`. */
  Rpc.make("DeleteTag", {
    payload: { id: Id },
    success: Schema.String,
    error: Schema.Union([TagNotFound, SystemTagLocked]),
  }),
  /**
   * `tagId` defaults to the `default` tag, `privacy` and `shareToLive` to the
   * user's settings. `TagNotFound` when the tag isn't theirs; `InvalidInput`
   * when the assigned date is after the deadline.
   */
  Rpc.make("CreateTask", {
    payload: CreateTaskInput,
    success: Task,
    error: Schema.Union([InvalidInput, TagNotFound]),
  }),
  /** A partial update: a missing key is unchanged, `null` clears. */
  Rpc.make("UpdateTask", {
    payload: UpdateTaskInput,
    success: Task,
    error: Schema.Union([InvalidInput, TaskNotFound, TagNotFound]),
  }),
  /** Settling records a `task_settled` activity; leaving `settled` removes it. */
  Rpc.make("SetTaskStatus", {
    payload: SetTaskStatusInput,
    success: Task,
    error: Schema.Union([InvalidInput, TaskNotFound]),
  }),
  /** Deletes a task and its activity, and returns its id. */
  Rpc.make("DeleteTask", {
    payload: { id: Id },
    success: Schema.String,
    error: Schema.Union([InvalidInput, TaskNotFound]),
  }),
  Rpc.make("GetTask", {
    payload: { id: Id },
    success: Task,
    error: Schema.Union([InvalidInput, TaskNotFound]),
  }),
  /** `/now`'s tasks for a day: those assigned or due that day, open and settled. */
  Rpc.make("ListTasksForDay", {
    payload: { date: LocalDate },
    success: TasksForDay,
    error: InvalidInput,
  }),
  Rpc.make("ListUnscheduledTasks", {
    payload: ListUnscheduledTasksInput,
    success: UnscheduledTasks,
    error: InvalidInput,
  }),
  /** `/tasks`: filtered, newest first, paginated by `nextCursor`. */
  Rpc.make("ListTasks", {
    payload: ListTasksInput,
    success: TaskPage,
    error: InvalidInput,
  }),
  /**
   * `startDate` defaults to today, `privacy` and `shareToLive` to the user's
   * settings. `InvalidInput` when the schedule's fields don't fit its kind.
   */
  Rpc.make("CreateHabit", {
    payload: CreateHabitInput,
    success: Habit,
    error: InvalidInput,
  }),
  /** A partial update; a new `schedule` replaces the rule and keeps the check-ins. */
  Rpc.make("UpdateHabit", {
    payload: UpdateHabitInput,
    success: Habit,
    error: Schema.Union([InvalidInput, HabitNotFound]),
  }),
  /** Pauses from today; paused days are never due and never break the streak. */
  Rpc.make("PauseHabit", {
    payload: { id: Id },
    success: Habit,
    error: Schema.Union([InvalidInput, HabitNotFound]),
  }),
  /** Makes a paused or archived habit active again from today. */
  Rpc.make("ResumeHabit", {
    payload: { id: Id },
    success: Habit,
    error: Schema.Union([InvalidInput, HabitNotFound]),
  }),
  Rpc.make("ArchiveHabit", {
    payload: { id: Id },
    success: Habit,
    error: Schema.Union([InvalidInput, HabitNotFound]),
  }),
  /** Deletes a habit with its check-ins, pauses and activity, and returns its id. */
  Rpc.make("DeleteHabit", {
    payload: { id: Id },
    success: Schema.String,
    error: Schema.Union([InvalidInput, HabitNotFound]),
  }),
  /**
   * One tap on a day (today or up to 30 days back, and due). Meeting the
   * period's target records a `habit_completed` activity.
   */
  Rpc.make("CheckInHabit", {
    payload: HabitCheckInInput,
    success: HabitOnDay,
    error: Schema.Union([InvalidInput, HabitNotFound, CheckInNotAllowed]),
  }),
  /** Takes back one tap; dropping below the target removes the `habit_completed` row. */
  Rpc.make("UndoCheckInHabit", {
    payload: HabitCheckInInput,
    success: HabitOnDay,
    error: Schema.Union([InvalidInput, HabitNotFound, CheckInNotAllowed]),
  }),
  /** `/now`'s habits for a day: due and settled, and whether all are checked. */
  Rpc.make("ListHabitsForDay", {
    payload: { date: LocalDate },
    success: HabitsForDay,
    error: InvalidInput,
  }),
  /** `/habits`: every habit with its schedule, streak, progress and last 12 weeks. */
  Rpc.make("ListHabits", {
    success: Schema.Array(HabitSummary),
  }),
  Rpc.make("GetHabit", {
    payload: { id: Id },
    success: HabitSummary,
    error: Schema.Union([InvalidInput, HabitNotFound]),
  }),
  /**
   * `count` goals need `targetCount`; `value` is the starting progress.
   * `privacy` and `shareToLive` default to the user's settings.
   */
  Rpc.make("CreateGoal", {
    payload: CreateGoalInput,
    success: Goal,
    error: InvalidInput,
  }),
  /**
   * A partial update. `progressMode` switches the mode (carrying progress
   * over) only when the goal has no links; `targetCount` changes a count
   * goal's target, which can complete or reopen it.
   */
  Rpc.make("UpdateGoal", {
    payload: UpdateGoalInput,
    success: Goal,
    error: Schema.Union([InvalidInput, GoalNotFound]),
  }),
  /** Sets a slider's percent or a count. Reaching the target completes the goal; dropping below reopens it. */
  Rpc.make("SetGoalProgress", {
    payload: SetGoalProgressInput,
    success: Goal,
    error: Schema.Union([InvalidInput, GoalNotFound]),
  }),
  /** Moves the progress by `delta`, clamped to the goal's range. */
  Rpc.make("AdjustGoalProgress", {
    payload: AdjustGoalProgressInput,
    success: Goal,
    error: Schema.Union([InvalidInput, GoalNotFound]),
  }),
  /** Hides an active goal from `/now`; linked habits and tasks still move it. */
  Rpc.make("PauseGoal", {
    payload: { id: Id },
    success: Goal,
    error: Schema.Union([InvalidInput, GoalNotFound]),
  }),
  Rpc.make("ResumeGoal", {
    payload: { id: Id },
    success: Goal,
    error: Schema.Union([InvalidInput, GoalNotFound]),
  }),
  /** Makes a completed goal active again and removes its `goal_completed` activity. */
  Rpc.make("ReopenGoal", {
    payload: { id: Id },
    success: Goal,
    error: Schema.Union([InvalidInput, GoalNotFound]),
  }),
  /** Deletes a goal with its links, progress history and activity, and returns its id. */
  Rpc.make("DeleteGoal", {
    payload: { id: Id },
    success: Schema.String,
    error: Schema.Union([InvalidInput, GoalNotFound]),
  }),
  /**
   * Links a habit or task to a count goal (or changes the link's amount).
   * `InvalidInput` for a slider goal or past 50 links; `TaskNotFound` or
   * `HabitNotFound` when the item isn't the user's.
   */
  Rpc.make("LinkGoalItem", {
    payload: LinkGoalItemInput,
    success: GoalLink,
    error: Schema.Union([InvalidInput, GoalNotFound, TaskNotFound, HabitNotFound]),
  }),
  /** Removes a link; the progress it added stays. */
  Rpc.make("UnlinkGoalItem", {
    payload: UnlinkGoalItemInput,
    error: Schema.Union([InvalidInput, GoalNotFound]),
  }),
  /** `/now`'s goals for a day: active ones, and those completed that day. */
  Rpc.make("ListGoalsForDay", {
    payload: { date: LocalDate },
    success: GoalsForDay,
    error: InvalidInput,
  }),
  /** `/goals`: every goal (or those with `status`), with links and the last 10 progress events. */
  Rpc.make("ListGoals", {
    payload: ListGoalsInput,
    success: Schema.Array(GoalSummary),
    error: InvalidInput,
  }),
  /** A goal with its links and the last 50 progress events. */
  Rpc.make("GetGoal", {
    payload: { id: Id },
    success: GoalSummary,
    error: Schema.Union([InvalidInput, GoalNotFound]),
  }),
  /** The goals a habit or task is linked to, for its card. */
  Rpc.make("ListItemGoals", {
    payload: GoalItemRef,
    success: Schema.Array(ItemGoal),
    error: InvalidInput,
  }),
  /**
   * Writes a note for today in the user's zone, with a `note_created`
   * activity. `InvalidInput` when `date` isn't today; `NoteLimitReached`
   * past 50 notes that day.
   */
  Rpc.make("CreateNote", {
    payload: CreateNoteInput,
    success: Note,
    error: Schema.Union([InvalidInput, NoteLimitReached]),
  }),
  /** A partial update of the body, privacy or share flag; past notes too. */
  Rpc.make("UpdateNote", {
    payload: UpdateNoteInput,
    success: Note,
    error: Schema.Union([InvalidInput, NoteNotFound]),
  }),
  /** Deletes a note and its activity, and returns its id. */
  Rpc.make("DeleteNote", {
    payload: { id: Id },
    success: Schema.String,
    error: Schema.Union([InvalidInput, NoteNotFound]),
  }),
  /** The notes written on a day, oldest first. */
  Rpc.make("ListNotesForDay", {
    payload: { date: LocalDate },
    success: NotesForDay,
    error: InvalidInput,
  }),
  /** `/notes`: searched, grouped by day, newest first, paginated by `nextCursor`. */
  Rpc.make("ListNotes", {
    payload: ListNotesInput,
    success: NotePage,
    error: InvalidInput,
  }),
  /**
   * Starts a focus session now, with a `session_started` activity. While
   * another is running or paused: `ActiveSessionExists` carrying it, or with
   * `replaceActive` that one is stopped in the same transaction.
   */
  Rpc.make("StartSession", {
    payload: StartSessionInput,
    success: FocusSession,
    error: Schema.Union([InvalidInput, ActiveSessionExists]),
  }),
  /** Pauses a running session. */
  Rpc.make("PauseSession", {
    payload: { id: Id },
    success: FocusSession,
    error: Schema.Union([InvalidInput, SessionNotFound, SessionTransitionNotAllowed]),
  }),
  /** Resumes a paused session; `endsAt` moves by the pause. */
  Rpc.make("ResumeSession", {
    payload: { id: Id },
    success: FocusSession,
    error: Schema.Union([InvalidInput, SessionNotFound, SessionTransitionNotAllowed]),
  }),
  /** Adds minutes to a running or paused session; `InvalidInput` past 600 in all. */
  Rpc.make("ExtendSession", {
    payload: ExtendSessionInput,
    success: FocusSession,
    error: Schema.Union([InvalidInput, SessionNotFound, SessionTransitionNotAllowed]),
  }),
  /** Ends a running or paused session early as `stopped`, with a `session_stopped` activity. */
  Rpc.make("StopSession", {
    payload: { id: Id },
    success: FocusSession,
    error: Schema.Union([InvalidInput, SessionNotFound, SessionTransitionNotAllowed]),
  }),
  /** The running or paused session, or `null`. Completes one whose time ran out first. */
  Rpc.make("GetActiveSession", {
    success: Schema.NullOr(FocusSession),
  }),
  /** `/sessions`: grouped by day with focused minutes, newest first, paginated by `nextCursor`. */
  Rpc.make("ListSessions", {
    payload: ListSessionsInput,
    success: SessionPage,
    error: InvalidInput,
  }),
  /** The sessions started on a day, oldest first, with that day's focused minutes. */
  Rpc.make("ListSessionsForDay", {
    payload: { date: LocalDate },
    success: SessionsForDay,
    error: InvalidInput,
  }),
  /**
   * Everything `/now` shows for a day in one call: its tasks, unscheduled
   * tasks, habits, goals, sessions and the notes count.
   */
  Rpc.make("GetDay", {
    payload: { date: LocalDate },
    success: Day,
    error: InvalidInput,
  }),
  /**
   * Upcoming: open tasks, scheduled habits (flexible ones once per period)
   * and dated goals for `[from, from + days)`, grouped by day, at most 60
   * days. Empty days are left out; `InvalidInput` when `from` is in the past.
   */
  Rpc.make("GetUpcoming", {
    payload: GetUpcomingInput,
    success: Upcoming,
    error: InvalidInput,
  }),
  /** Deletes a session and its activity, and returns its id. */
  Rpc.make("DeleteSession", {
    payload: { id: Id },
    success: Schema.String,
    error: Schema.Union([InvalidInput, SessionNotFound]),
  }),
).middleware(Authentication) {}

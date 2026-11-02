import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { LocalDate } from "./dates.ts";

// The domain's values and typed errors. Pure Schemas with no database code,
// so `../rpc.ts` (which the browser imports) can re-export them, and the
// Drizzle enums in `../schema.ts` are built from the same literal lists.

// ─── Enums ───────────────────────────────────────────────────────────────────

export const PRIVACY = ["public", "connections", "private"] as const;
export const Privacy = Schema.Literals(PRIVACY);
export type Privacy = typeof Privacy.Type;

export const RELAY_POLICY = ["connections", "anyone", "none"] as const;
export const RelayPolicy = Schema.Literals(RELAY_POLICY);
export type RelayPolicy = typeof RelayPolicy.Type;

/** The three tags every user has. Recolorable, but never renamed or deleted. */
export const SYSTEM_TAG_KIND = ["default", "habit", "goal"] as const;
export const SystemTagKind = Schema.Literals(SYSTEM_TAG_KIND);
export type SystemTagKind = typeof SystemTagKind.Type;

/**
 * Tag colors are keys of a small fixed palette, not hex values: the UI maps
 * each key to a light and a dark shade (`--tag-<key>` in `web/src/styles.css`),
 * so every tag stays readable in both themes.
 */
export const TAG_COLOR = [
  "gray",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "indigo",
  "violet",
  "pink",
] as const;
export const TagColor = Schema.Literals(TAG_COLOR);
export type TagColor = typeof TagColor.Type;

/**
 * Each user's color, picked at random from the tag palette when their
 * settings row is created. The live feed shows their username in it. Gray is
 * left out: it reads as muted text, not as a name.
 */
export const USER_COLOR = TAG_COLOR.filter(
  (color): color is Exclude<TagColor, "gray"> => color !== "gray",
);
export const UserColor = Schema.Literals(USER_COLOR);
export type UserColor = typeof UserColor.Type;

/** `working` is only a label; `settled` is done. */
export const TASK_STATUS = ["idle", "working", "settled"] as const;
export const TaskStatus = Schema.Literals(TASK_STATUS);
export type TaskStatus = typeof TaskStatus.Type;

/** Which of a task's dates fall on a given day. */
export const TASK_DATE_ROLE = ["assigned", "deadline", "both"] as const;
export const TaskDateRole = Schema.Literals(TASK_DATE_ROLE);
export type TaskDateRole = typeof TaskDateRole.Type;

/**
 * `flexible`: `target_count` times per period of `period_length` ×
 * `period_unit` (daily-with-a-count is `day` × 1). `specific_days`:
 * `target_count` taps on each listed weekday or month day.
 */
export const HABIT_SCHEDULE_KIND = ["flexible", "specific_days"] as const;
export const HabitScheduleKind = Schema.Literals(HABIT_SCHEDULE_KIND);
export type HabitScheduleKind = typeof HabitScheduleKind.Type;

export const HABIT_PERIOD_UNIT = ["day", "week", "month"] as const;
export const HabitPeriodUnit = Schema.Literals(HABIT_PERIOD_UNIT);
export type HabitPeriodUnit = typeof HabitPeriodUnit.Type;

/** `paused` and `archived` habits always have an open pause row. */
export const HABIT_STATUS = ["active", "paused", "archived"] as const;
export const HabitStatus = Schema.Literals(HABIT_STATUS);
export type HabitStatus = typeof HabitStatus.Type;

/** A habit on a day: not due, due (target not met yet), or complete for its period or day. */
export const HABIT_DAY_STATUS = ["not_due", "due", "complete"] as const;
export const HabitDayStatus = Schema.Literals(HABIT_DAY_STATUS);
export type HabitDayStatus = typeof HabitDayStatus.Type;

/** What every activity row can record. See architecture.md §5. */
export const ACTIVITY_KIND = [
  "task_settled",
  "habit_completed",
  "goal_progressed",
  "goal_completed",
  "session_started",
  "session_completed",
  "session_stopped",
  "note_created",
] as const;
export type ActivityKind = (typeof ACTIVITY_KIND)[number];

export const ACTIVITY_SUBJECT = ["task", "habit", "goal", "session", "note"] as const;
export type ActivitySubject = (typeof ACTIVITY_SUBJECT)[number];

// ─── Limits ──────────────────────────────────────────────────────────────────

export const TAG_NAME_MAX_LENGTH = 30;
/** Per user, the system tags included. */
export const MAX_TAGS_PER_USER = 50;
/** IANA names are far shorter; this only bounds the request body. */
export const TIME_ZONE_MAX_LENGTH = 64;

export const TASK_TITLE_MAX_LENGTH = 200;
export const TASK_DESCRIPTION_MAX_LENGTH = 2000;
export const TASK_IMPORTANCE_MAX = 5;
/** One day. */
export const TASK_EXPECTED_MINUTES_MAX = 1440;
export const TASK_SEARCH_MAX_LENGTH = 200;
export const TASK_PAGE_SIZE_DEFAULT = 50;
export const TASK_PAGE_SIZE_MAX = 100;
/** `ListTasks` cursors are `<ISO timestamp>|<uuid>`; this only bounds the request body. */
export const TASK_CURSOR_MAX_LENGTH = 128;

export const HABIT_TITLE_MAX_LENGTH = 200;
export const HABIT_DESCRIPTION_MAX_LENGTH = 2000;
export const HABIT_TARGET_MAX = 100;
export const HABIT_PERIOD_LENGTH_MAX = 365;
/** Check-ins (and undos) reach back this many days before today. */
export const HABIT_CHECKIN_DAYS_BACK = 30;
/** `ListHabits`' history: this many weeks, ending with the current one. */
export const HABIT_HISTORY_WEEKS = 12;

/** A tag name: trimmed, 1–30 characters. */
export const TagName = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isBetweenLength(1, TAG_NAME_MAX_LENGTH),
);

// ─── Inputs ──────────────────────────────────────────────────────────────────
// The RPCs use these as payloads, and the services decode them again, since
// Tibo's tools (step 18) call the services without going through an RPC.

/** Ids are UUIDs; this only bounds the request body. */
export const Id = Schema.String.check(Schema.isBetweenLength(1, 64));

export const SettingsPatch = Schema.Struct({
  defaultPrivacy: Schema.optionalKey(Privacy),
  defaultShareToLive: Schema.optionalKey(Schema.Boolean),
  relayPolicy: Schema.optionalKey(RelayPolicy),
});
export type SettingsPatch = typeof SettingsPatch.Type;

export const CreateTagInput = Schema.Struct({ name: TagName, color: TagColor });
export type CreateTagInput = typeof CreateTagInput.Type;

/** Omitted fields are left as they are. System tags accept `color` only. */
export const UpdateTagInput = Schema.Struct({
  id: Id,
  name: Schema.optionalKey(TagName),
  color: Schema.optionalKey(TagColor),
});
export type UpdateTagInput = typeof UpdateTagInput.Type;

export const TaskTitle = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isBetweenLength(1, TASK_TITLE_MAX_LENGTH),
);
export const TaskDescription = Schema.String.check(Schema.isMaxLength(TASK_DESCRIPTION_MAX_LENGTH));
/** 1–5 stars. */
export const TaskImportance = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: TASK_IMPORTANCE_MAX }));
export const TaskExpectedMinutes = Schema.Int.check(
  Schema.isBetween({ minimum: 1, maximum: TASK_EXPECTED_MINUTES_MAX }),
);

/**
 * Omitted optional fields stay unset. `tagId` defaults to the user's
 * `default` tag; `privacy` and `shareToLive` to their settings defaults. New
 * tasks start `idle`.
 */
export const CreateTaskInput = Schema.Struct({
  title: TaskTitle,
  description: Schema.optionalKey(Schema.NullOr(TaskDescription)),
  assignedDate: Schema.optionalKey(Schema.NullOr(LocalDate)),
  deadlineDate: Schema.optionalKey(Schema.NullOr(LocalDate)),
  tagId: Schema.optionalKey(Id),
  privacy: Schema.optionalKey(Privacy),
  shareToLive: Schema.optionalKey(Schema.Boolean),
  importance: Schema.optionalKey(Schema.NullOr(TaskImportance)),
  expectedMinutes: Schema.optionalKey(Schema.NullOr(TaskExpectedMinutes)),
});
export type CreateTaskInput = typeof CreateTaskInput.Type;

/**
 * A partial update: an omitted key is left as it is, and `null` clears an
 * optional field. The status changes through `SetTaskStatus` only.
 */
export const UpdateTaskInput = Schema.Struct({
  id: Id,
  title: Schema.optionalKey(TaskTitle),
  description: Schema.optionalKey(Schema.NullOr(TaskDescription)),
  assignedDate: Schema.optionalKey(Schema.NullOr(LocalDate)),
  deadlineDate: Schema.optionalKey(Schema.NullOr(LocalDate)),
  tagId: Schema.optionalKey(Id),
  privacy: Schema.optionalKey(Privacy),
  shareToLive: Schema.optionalKey(Schema.Boolean),
  importance: Schema.optionalKey(Schema.NullOr(TaskImportance)),
  expectedMinutes: Schema.optionalKey(Schema.NullOr(TaskExpectedMinutes)),
});
export type UpdateTaskInput = typeof UpdateTaskInput.Type;

export const SetTaskStatusInput = Schema.Struct({ id: Id, status: TaskStatus });
export type SetTaskStatusInput = typeof SetTaskStatusInput.Type;

export const ListUnscheduledTasksInput = Schema.Struct({
  /** Also return the unscheduled tasks settled on this day (in the user's zone). */
  settledOn: Schema.optionalKey(LocalDate),
});
export type ListUnscheduledTasksInput = typeof ListUnscheduledTasksInput.Type;

/**
 * `/tasks`' filters, newest first. `from`/`to` (inclusive) match a task whose
 * assigned or deadline date falls in the range; `query` matches the title,
 * ignoring case. Pass the previous page's `nextCursor` as `cursor`.
 */
export const ListTasksInput = Schema.Struct({
  status: Schema.optionalKey(
    Schema.Array(TaskStatus).check(Schema.isMaxLength(TASK_STATUS.length)),
  ),
  tagId: Schema.optionalKey(Id),
  from: Schema.optionalKey(LocalDate),
  to: Schema.optionalKey(LocalDate),
  query: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(TASK_SEARCH_MAX_LENGTH))),
  cursor: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(TASK_CURSOR_MAX_LENGTH))),
  limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: TASK_PAGE_SIZE_MAX }))),
});
export type ListTasksInput = typeof ListTasksInput.Type;

export const HabitTitle = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isBetweenLength(1, HABIT_TITLE_MAX_LENGTH),
);
export const HabitDescription = Schema.String.check(Schema.isMaxLength(HABIT_DESCRIPTION_MAX_LENGTH));

/**
 * A habit's rule, set and replaced as a whole. `flexible` needs `periodUnit`
 * and `periodLength` and no days; `specific_days` needs exactly one of
 * `weekdays` (0 = Sun … 6 = Sat) or `monthDays` (1–31; a day past the
 * month's end falls on its last day). Days are deduplicated and sorted.
 */
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

/**
 * `startDate` defaults to today in the user's zone; `privacy` and
 * `shareToLive` to their settings defaults. New habits start `active`.
 */
export const CreateHabitInput = Schema.Struct({
  title: HabitTitle,
  description: Schema.optionalKey(Schema.NullOr(HabitDescription)),
  schedule: HabitSchedule,
  startDate: Schema.optionalKey(LocalDate),
  privacy: Schema.optionalKey(Privacy),
  shareToLive: Schema.optionalKey(Schema.Boolean),
});
export type CreateHabitInput = typeof CreateHabitInput.Type;

/**
 * A partial update: an omitted key is left as it is, and `null` clears the
 * description. A new `schedule` replaces the rule; check-ins are kept. The
 * status changes through Pause, Resume and Archive only.
 */
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

/** A tap (or its undo) on `date`, a day in the user's zone: today or up to 30 days back. */
export const HabitCheckInInput = Schema.Struct({ id: Id, date: LocalDate });
export type HabitCheckInInput = typeof HabitCheckInInput.Type;

/** Decodes a service's input, failing with {@link InvalidInput}. */
export const decodeInput =
  <S extends Schema.Decoder<unknown>>(schema: S) =>
  (input: unknown): Effect.Effect<S["Type"], InvalidInput, S["DecodingServices"]> =>
    Schema.decodeUnknownEffect(schema)(input).pipe(
      Effect.mapError((error) => new InvalidInput({ message: error.message })),
    );

// ─── Values ──────────────────────────────────────────────────────────────────

/** The settings a user can see and change. `aiQuotaOverride` stays server-side. */
export class Settings extends Schema.Class<Settings>("Settings")({
  timeZone: Schema.String,
  /** Assigned once at random; not user-editable yet. */
  color: UserColor,
  defaultPrivacy: Privacy,
  defaultShareToLive: Schema.Boolean,
  relayPolicy: RelayPolicy,
}) {}

export class Tag extends Schema.Class<Tag>("Tag")({
  id: Schema.String,
  name: Schema.String,
  color: TagColor,
  /** Set on the three system tags, `null` on the user's own. */
  systemKind: Schema.NullOr(SystemTagKind),
  createdAt: Schema.Date,
}) {}

export class Task extends Schema.Class<Task>("Task")({
  id: Schema.String,
  title: Schema.String,
  description: Schema.NullOr(Schema.String),
  assignedDate: Schema.NullOr(LocalDate),
  deadlineDate: Schema.NullOr(LocalDate),
  tagId: Schema.String,
  status: TaskStatus,
  /** Set exactly when `status` is `settled`. */
  settledAt: Schema.NullOr(Schema.Date),
  privacy: Privacy,
  shareToLive: Schema.Boolean,
  importance: Schema.NullOr(Schema.Number),
  expectedMinutes: Schema.NullOr(Schema.Number),
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}

/** A task on a day, with which of its dates fall on that day ("Due today" when `deadline`). */
export class DayTask extends Schema.Class<DayTask>("DayTask")({
  task: Task,
  role: TaskDateRole,
}) {}

/**
 * The tasks whose assigned or deadline date is `date`. `open` is oldest
 * first; `settled` (including tasks settled before their deadline day) is
 * most recently settled first.
 */
export class TasksForDay extends Schema.Class<TasksForDay>("TasksForDay")({
  date: LocalDate,
  open: Schema.Array(DayTask),
  settled: Schema.Array(DayTask),
}) {}

/** Tasks with no dates. `settled` is empty unless `settledOn` was asked for. */
export class UnscheduledTasks extends Schema.Class<UnscheduledTasks>("UnscheduledTasks")({
  open: Schema.Array(Task),
  settled: Schema.Array(Task),
}) {}

export class TaskPage extends Schema.Class<TaskPage>("TaskPage")({
  tasks: Schema.Array(Task),
  /** `null` on the last page. */
  nextCursor: Schema.NullOr(Schema.String),
}) {}

export class Habit extends Schema.Class<Habit>("Habit")({
  id: Schema.String,
  title: Schema.String,
  description: Schema.NullOr(Schema.String),
  scheduleKind: HabitScheduleKind,
  targetCount: Schema.Number,
  /** `day` × 1 for `specific_days`. */
  periodUnit: HabitPeriodUnit,
  periodLength: Schema.Number,
  /** Set (non-empty) only for weekday habits. */
  weekdays: Schema.NullOr(Schema.Array(Schema.Number)),
  /** Set (non-empty) only for month-day habits. */
  monthDays: Schema.NullOr(Schema.Array(Schema.Number)),
  startDate: LocalDate,
  status: HabitStatus,
  privacy: Privacy,
  shareToLive: Schema.Boolean,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}

/** Taps in the period (flexible) or on the day (specific days) containing some date. */
export class HabitProgress extends Schema.Class<HabitProgress>("HabitProgress")({
  /** The period's first and last days; the same day for `specific_days`. */
  periodStart: LocalDate,
  periodEnd: LocalDate,
  done: Schema.Number,
  target: Schema.Number,
  complete: Schema.Boolean,
}) {}

/** One day's taps. */
export class HabitCheckin extends Schema.Class<HabitCheckin>("HabitCheckin")({
  date: LocalDate,
  count: Schema.Number,
}) {}

/** A habit as it stands on `date` (what `/now` shows, and what a check-in returns). */
export class HabitOnDay extends Schema.Class<HabitOnDay>("HabitOnDay")({
  habit: Habit,
  /** `describeSchedule`: "3 times a week", "Every Mon, Wed, Fri". */
  schedule: Schema.String,
  date: LocalDate,
  status: HabitDayStatus,
  progress: HabitProgress,
  /** Taps on `date` itself, which an undo can take back. */
  countOnDay: Schema.Number,
  /** As of today, not `date`. */
  streak: Schema.Number,
}) {}

/**
 * `/now`'s habits for a day: `due` (target not met yet) and `settled` (met
 * this period or day), both oldest first. Paused, archived and unscheduled
 * habits are left out. `allChecked` is true when at least one habit is
 * scheduled that day and none is still due.
 */
export class HabitsForDay extends Schema.Class<HabitsForDay>("HabitsForDay")({
  date: LocalDate,
  due: Schema.Array(HabitOnDay),
  settled: Schema.Array(HabitOnDay),
  allChecked: Schema.Boolean,
}) {}

/** `/habits`: a habit with its streak, current progress and recent taps. */
export class HabitSummary extends Schema.Class<HabitSummary>("HabitSummary")({
  habit: Habit,
  schedule: Schema.String,
  streak: Schema.Number,
  /** The period (or scheduled day) containing today. */
  progress: HabitProgress,
  /** Days with taps over the last 12 weeks (from the Sunday 11 weeks before this one), oldest first. */
  history: Schema.Array(HabitCheckin),
}) {}

// ─── Errors ──────────────────────────────────────────────────────────────────

/** Input that fails a rule its Schema can't express, or that skipped the RPC decode (Tibo). */
export class InvalidInput extends Schema.TaggedError<InvalidInput>()("InvalidInput", {
  message: Schema.String,
}) {}

export class TagNotFound extends Schema.TaggedError<TagNotFound>()("TagNotFound", {
  message: Schema.String,
  id: Schema.String,
}) {}

export class TagNameTaken extends Schema.TaggedError<TagNameTaken>()("TagNameTaken", {
  message: Schema.String,
  name: Schema.String,
}) {}

export class TagLimitReached extends Schema.TaggedError<TagLimitReached>()("TagLimitReached", {
  message: Schema.String,
  limit: Schema.Number,
}) {}

/** Renaming or deleting a system tag. */
export class SystemTagLocked extends Schema.TaggedError<SystemTagLocked>()("SystemTagLocked", {
  message: Schema.String,
  id: Schema.String,
}) {}

export class TaskNotFound extends Schema.TaggedError<TaskNotFound>()("TaskNotFound", {
  message: Schema.String,
  id: Schema.String,
}) {}

export class HabitNotFound extends Schema.TaggedError<HabitNotFound>()("HabitNotFound", {
  message: Schema.String,
  id: Schema.String,
}) {}

export const CHECK_IN_REFUSAL = ["future", "too_old", "not_due", "not_active"] as const;
export type CheckInRefusal = (typeof CHECK_IN_REFUSAL)[number];

/** A tap (or undo) on a future day, more than 30 days back, a day the habit isn't due, or a paused or archived habit. */
export class CheckInNotAllowed extends Schema.TaggedError<CheckInNotAllowed>()("CheckInNotAllowed", {
  message: Schema.String,
  reason: Schema.Literals(CHECK_IN_REFUSAL),
}) {}

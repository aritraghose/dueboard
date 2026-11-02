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

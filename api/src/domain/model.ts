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
  "habit_checked",
  "goal_progressed",
  "goal_completed",
  "session_started",
  "session_completed",
  "session_stopped",
  "note_created",
] as const;
export const ActivityKind = Schema.Literals(ACTIVITY_KIND);
export type ActivityKind = typeof ActivityKind.Type;

/** `slider`: the user sets 0–100%. `count`: `current_count` of `target_count`; the percent is derived. */
export const GOAL_PROGRESS_MODE = ["slider", "count"] as const;
export const GoalProgressMode = Schema.Literals(GOAL_PROGRESS_MODE);
export type GoalProgressMode = typeof GoalProgressMode.Type;

/** `completed` exactly while progress is at its target (or after reaching it, until it drops or is reopened). */
export const GOAL_STATUS = ["active", "paused", "completed"] as const;
export const GoalStatus = Schema.Literals(GOAL_STATUS);
export type GoalStatus = typeof GoalStatus.Type;

/** What can be linked to a (count) goal. */
export const GOAL_LINK_ITEM = ["habit", "task"] as const;
export const GoalLinkItem = Schema.Literals(GOAL_LINK_ITEM);
export type GoalLinkItem = typeof GoalLinkItem.Type;

/** What moved a goal's progress. */
export const GOAL_PROGRESS_SOURCE = ["manual", "habit", "task"] as const;
export const GoalProgressSource = Schema.Literals(GOAL_PROGRESS_SOURCE);
export type GoalProgressSource = typeof GoalProgressSource.Type;

export const ACTIVITY_SUBJECT = ["task", "habit", "goal", "session", "note"] as const;
export type ActivitySubject = (typeof ACTIVITY_SUBJECT)[number];

/** How Live shows an event: with its title, or without it (another person's private item). */
export const LIVE_DISPLAY = ["full", "redacted"] as const;
export const LiveDisplay = Schema.Literals(LIVE_DISPLAY);
export type LiveDisplay = typeof LiveDisplay.Type;

/** Whose events a Live feed shows: the viewer's and their connections', only connections', or only the viewer's. */
export const LIVE_SCOPE = ["all", "connections", "mine"] as const;
export const LiveScope = Schema.Literals(LIVE_SCOPE);
export type LiveScope = typeof LiveScope.Type;

/** What the Path (the viewer's own day as one thread) lists. `habit_checked` is a habit tapped today. */
export const PATH_KIND = ["task_settled", "habit_checked", "goal_progressed", "session_completed"] as const;
export const PathKind = Schema.Literals(PATH_KIND);
export type PathKind = typeof PathKind.Type;

/**
 * A focus session is `running` or `paused` while active (at most one per
 * user), then `completed` when its time runs out or `stopped` when it ends
 * early (by the user, or because a new session replaced it).
 */
export const SESSION_STATUS = ["running", "paused", "completed", "stopped"] as const;
export const SessionStatus = Schema.Literals(SESSION_STATUS);
export type SessionStatus = typeof SessionStatus.Type;

/** What can be done to an active session. */
export const SESSION_ACTION = ["pause", "resume", "extend", "stop"] as const;
export type SessionAction = (typeof SESSION_ACTION)[number];

/** A request stays `pending` until the other user answers or the sender takes it back. */
export const CONNECTION_REQUEST_STATUS = ["pending", "accepted", "declined", "cancelled"] as const;
export type ConnectionRequestStatus = (typeof CONNECTION_REQUEST_STATUS)[number];

/**
 * How a viewer stands with another user, from the viewer's side. `blocked`
 * means the viewer blocked them (someone who blocked the viewer is never
 * shown at all). Logged-out viewers always get `none`.
 */
export const CONNECTION_STATE = [
  "self",
  "none",
  "pending_out",
  "pending_in",
  "connected",
  "blocked",
] as const;
export const ConnectionState = Schema.Literals(CONNECTION_STATE);
export type ConnectionState = typeof ConnectionState.Type;

/** A profile's tabs that list completed items. The Diary tab reads `GetDiary`. */
export const PROFILE_FEED = ["tasks", "habits", "goals", "sessions"] as const;
export const ProfileFeed = Schema.Literals(PROFILE_FEED);
export type ProfileFeed = typeof ProfileFeed.Type;

/** Whose points a leaderboard ranks: the viewer and their connections, or everyone. */
export const LEADERBOARD_SCOPE = ["connections", "public"] as const;
export const LeaderboardScope = Schema.Literals(LEADERBOARD_SCOPE);
export type LeaderboardScope = typeof LeaderboardScope.Type;

/** The days a leaderboard counts, in the viewer's zone (weeks start on Sunday). */
export const LEADERBOARD_PERIOD = ["all", "month", "week", "today"] as const;
export const LeaderboardPeriod = Schema.Literals(LEADERBOARD_PERIOD);
export type LeaderboardPeriod = typeof LeaderboardPeriod.Type;

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

export const GOAL_NAME_MAX_LENGTH = 200;
export const GOAL_DESCRIPTION_MAX_LENGTH = 2000;
/** Bounds both `target_count` and `current_count`. */
export const GOAL_COUNT_MAX = 1_000_000;
/** What one tap or settled task can add to a goal. */
export const GOAL_LINK_AMOUNT_MAX = 1000;
/** Links per goal. */
export const GOAL_LINKS_MAX = 50;
/** Progress events per goal in `ListGoals`, and in `GetGoal`. */
export const GOAL_EVENTS_IN_LIST = 10;
export const GOAL_EVENTS_IN_DETAIL = 50;

/** Counted in UTF-16 units like `maxLength`, so never more than `char_length`'s code points. */
export const NOTE_BODY_MAX_LENGTH = 60;
/** Per user and local day, so a script can't flood the diary or Live. */
export const MAX_NOTES_PER_DAY = 50;
export const NOTE_SEARCH_MAX_LENGTH = 60;
export const NOTE_PAGE_SIZE_DEFAULT = 50;
export const NOTE_PAGE_SIZE_MAX = 100;
/** `ListNotes` cursors are `<date>|<ISO timestamp>|<uuid>`; this only bounds the request body. */
export const NOTE_CURSOR_MAX_LENGTH = 160;

export const SESSION_LABEL_MAX_LENGTH = 100;
/** Ten hours; bounds both a start and the total after extends. */
export const SESSION_MINUTES_MAX = 600;
export const SESSION_PAGE_SIZE_DEFAULT = 30;
export const SESSION_PAGE_SIZE_MAX = 100;
/** `ListSessions` cursors are `<date>|<ISO timestamp>|<uuid>`; this only bounds the request body. */
export const SESSION_CURSOR_MAX_LENGTH = 160;
/** `GetUpcoming` covers at most this many days per call. */
export const UPCOMING_DAYS_MAX = 60;

/** Better Auth's `username` plugin rules (it stores usernames lowercased). */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
/**
 * Connection requests a user can send in any 24 hours, counted from the
 * table (the Rate Limiting binding only counts per 10 or 60 seconds).
 */
export const CONNECTION_REQUESTS_PER_DAY = 20;
/** People search: the shortest prefix it answers, and how many people it returns. */
export const PEOPLE_SEARCH_MIN_LENGTH = 2;
export const PEOPLE_SEARCH_LIMIT = 10;
/** Profile tabs page through items this many at a time. */
export const PROFILE_ITEMS_PAGE_SIZE = 30;
/** `GetProfileItems` cursors are `<ISO timestamp>|<id>`; this only bounds the request body. */
export const PROFILE_ITEMS_CURSOR_MAX_LENGTH = 128;
/** People search matches names too, so a query can hold spaces; this bounds it. */
export const PEOPLE_SEARCH_MAX_LENGTH = 60;
/** How many ranks a leaderboard shows (the viewer's own rank comes along too). */
export const LEADERBOARD_SIZE = 50;
/** Live pages through events this many at a time. */
export const LIVE_PAGE_SIZE = 30;
/** The most days one Live feed reaches back (`/live`; the card on `/now` asks for 2). */
export const LIVE_MAX_DAYS = 7;
/** What the account deletion form makes the user type. */
export const DELETE_ACCOUNT_CONFIRM_MAX_LENGTH = 64;

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
 * `/tasks`' filters, newest first. `tagIds` matches a task with any of those
 * tags; `from`/`to` (inclusive) match a task whose assigned or deadline date
 * falls in the range; `query` matches the title, ignoring case. Pass the
 * previous page's `nextCursor` as `cursor`.
 */
export const ListTasksInput = Schema.Struct({
  status: Schema.optionalKey(
    Schema.Array(TaskStatus).check(Schema.isMaxLength(TASK_STATUS.length)),
  ),
  tagIds: Schema.optionalKey(Schema.Array(Id).check(Schema.isMaxLength(MAX_TAGS_PER_USER))),
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

export const GoalName = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isBetweenLength(1, GOAL_NAME_MAX_LENGTH),
);
export const GoalDescription = Schema.String.check(Schema.isMaxLength(GOAL_DESCRIPTION_MAX_LENGTH));
export const GoalTargetCount = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: GOAL_COUNT_MAX }));
/** A count goal's value or a slider's percent; `goal-rules.ts` checks it against the mode. */
export const GoalValue = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: GOAL_COUNT_MAX }));
export const GoalLinkAmount = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: GOAL_LINK_AMOUNT_MAX }));

/**
 * `count` goals need `targetCount`. `value` is the starting progress
 * (a percent for `slider`, a count for `count`), 0 by default; starting at
 * the target creates the goal completed. `privacy` and `shareToLive`
 * default to the user's settings.
 */
export const CreateGoalInput = Schema.Struct({
  name: GoalName,
  description: Schema.optionalKey(Schema.NullOr(GoalDescription)),
  progressMode: GoalProgressMode,
  targetCount: Schema.optionalKey(GoalTargetCount),
  value: Schema.optionalKey(GoalValue),
  targetDate: Schema.optionalKey(Schema.NullOr(LocalDate)),
  privacy: Schema.optionalKey(Privacy),
  shareToLive: Schema.optionalKey(Schema.Boolean),
});
export type CreateGoalInput = typeof CreateGoalInput.Type;

/**
 * A partial update: an omitted key is left as it is, and `null` clears an
 * optional field. `progressMode` switches the mode (carrying the progress
 * over), and only when the goal has no links; switching to `count` needs
 * `targetCount`. `targetCount` alone changes a count goal's target.
 * Progress and status change through their own RPCs.
 */
export const UpdateGoalInput = Schema.Struct({
  id: Id,
  name: Schema.optionalKey(GoalName),
  description: Schema.optionalKey(Schema.NullOr(GoalDescription)),
  targetDate: Schema.optionalKey(Schema.NullOr(LocalDate)),
  privacy: Schema.optionalKey(Privacy),
  shareToLive: Schema.optionalKey(Schema.Boolean),
  progressMode: Schema.optionalKey(GoalProgressMode),
  targetCount: Schema.optionalKey(GoalTargetCount),
});
export type UpdateGoalInput = typeof UpdateGoalInput.Type;

/** Sets the progress: a percent (0–100) for a slider goal, a whole count for a count goal. */
export const SetGoalProgressInput = Schema.Struct({ id: Id, value: GoalValue });
export type SetGoalProgressInput = typeof SetGoalProgressInput.Type;

/** Moves the progress by `delta` (percent points or a whole count), clamped to the goal's range. */
export const AdjustGoalProgressInput = Schema.Struct({
  id: Id,
  delta: Schema.Finite.check(Schema.isBetween({ minimum: -GOAL_COUNT_MAX, maximum: GOAL_COUNT_MAX })),
});
export type AdjustGoalProgressInput = typeof AdjustGoalProgressInput.Type;

/** Links one of the user's habits or tasks to a count goal; linking again changes the amount. */
export const LinkGoalItemInput = Schema.Struct({
  goalId: Id,
  itemType: GoalLinkItem,
  itemId: Id,
  /** Added per tap or per settle. Defaults to 1. */
  amount: Schema.optionalKey(GoalLinkAmount),
});
export type LinkGoalItemInput = typeof LinkGoalItemInput.Type;

export const UnlinkGoalItemInput = Schema.Struct({ goalId: Id, itemType: GoalLinkItem, itemId: Id });
export type UnlinkGoalItemInput = typeof UnlinkGoalItemInput.Type;

/** `/goals`' filter: every goal when `status` is omitted. */
export const ListGoalsInput = Schema.Struct({
  status: Schema.optionalKey(Schema.Array(GoalStatus).check(Schema.isMaxLength(GOAL_STATUS.length))),
});
export type ListGoalsInput = typeof ListGoalsInput.Type;

/** A habit or task, to list the goals it's linked to. */
export const GoalItemRef = Schema.Struct({ itemType: GoalLinkItem, itemId: Id });
export type GoalItemRef = typeof GoalItemRef.Type;

/** A note: trimmed, 1–60 characters, one line. */
export const NoteBody = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isBetweenLength(1, NOTE_BODY_MAX_LENGTH),
  Schema.makeFilter((value: string) => !/[\r\n]/.test(value) || "A note is a single line"),
);

/**
 * Notes are written for today in the user's zone. `date`, when sent, must be
 * that day (it guards a client still showing yesterday after midnight).
 * `privacy` and `shareToLive` default to the user's settings.
 */
export const CreateNoteInput = Schema.Struct({
  body: NoteBody,
  date: Schema.optionalKey(LocalDate),
  privacy: Schema.optionalKey(Privacy),
  shareToLive: Schema.optionalKey(Schema.Boolean),
});
export type CreateNoteInput = typeof CreateNoteInput.Type;

/** Omitted fields are left as they are. Past notes can be edited too. */
export const UpdateNoteInput = Schema.Struct({
  id: Id,
  body: Schema.optionalKey(NoteBody),
  privacy: Schema.optionalKey(Privacy),
  shareToLive: Schema.optionalKey(Schema.Boolean),
});
export type UpdateNoteInput = typeof UpdateNoteInput.Type;

/**
 * `/notes`: newest day first, newest note first within a day. `query`
 * matches the body, ignoring case. Pass the previous page's `nextCursor`.
 */
export const ListNotesInput = Schema.Struct({
  query: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(NOTE_SEARCH_MAX_LENGTH))),
  cursor: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(NOTE_CURSOR_MAX_LENGTH))),
  limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: NOTE_PAGE_SIZE_MAX }))),
});
export type ListNotesInput = typeof ListNotesInput.Type;

/** A session's planned length, or what an extend adds: 1–600 whole minutes. */
export const SessionMinutes = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: SESSION_MINUTES_MAX }));

/** An optional session label: trimmed, 1–100 characters, one line. */
export const SessionLabel = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isBetweenLength(1, SESSION_LABEL_MAX_LENGTH),
  Schema.makeFilter((value: string) => !/[\r\n]/.test(value) || "A label is a single line"),
);

/**
 * Starts a session now. While another is running or paused this fails with
 * `ActiveSessionExists`, unless `replaceActive` is set: then the other one
 * is stopped and this one started in the same transaction. `privacy` and
 * `shareToLive` default to the user's settings.
 */
export const StartSessionInput = Schema.Struct({
  minutes: SessionMinutes,
  label: Schema.optionalKey(SessionLabel),
  privacy: Schema.optionalKey(Privacy),
  shareToLive: Schema.optionalKey(Schema.Boolean),
  replaceActive: Schema.optionalKey(Schema.Boolean),
});
export type StartSessionInput = typeof StartSessionInput.Type;

/** Adds minutes to a running or paused session; the total stays within 600. */
export const ExtendSessionInput = Schema.Struct({ id: Id, minutes: SessionMinutes });
export type ExtendSessionInput = typeof ExtendSessionInput.Type;

/** `/sessions`: newest day first, newest session first. Pass the previous page's `nextCursor`. */
export const ListSessionsInput = Schema.Struct({
  cursor: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(SESSION_CURSOR_MAX_LENGTH))),
  limit: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: SESSION_PAGE_SIZE_MAX })),
  ),
});
export type ListSessionsInput = typeof ListSessionsInput.Type;

/** Upcoming: the days `[from, from + days)`, `from` today or later. */
export const GetUpcomingInput = Schema.Struct({
  from: LocalDate,
  days: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: UPCOMING_DAYS_MAX })),
});
export type GetUpcomingInput = typeof GetUpcomingInput.Type;

/** A username as typed: an optional leading `@`, any case. Services normalize it. */
export const UsernameInput = Schema.String.check(Schema.isBetweenLength(1, USERNAME_MAX_LENGTH + 1));

export const UsernameRef = Schema.Struct({ username: UsernameInput });
export type UsernameRef = typeof UsernameRef.Type;

export const ConnectionRequestRef = Schema.Struct({ requestId: Id });
export type ConnectionRequestRef = typeof ConnectionRequestRef.Type;

export const SearchPeopleInput = Schema.Struct({
  query: Schema.String.check(Schema.isMaxLength(PEOPLE_SEARCH_MAX_LENGTH)),
});
export type SearchPeopleInput = typeof SearchPeopleInput.Type;

/** One page of a profile tab, newest first. */
export const GetProfileItemsInput = Schema.Struct({
  username: UsernameInput,
  feed: ProfileFeed,
  cursor: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(PROFILE_ITEMS_CURSOR_MAX_LENGTH))),
});
export type GetProfileItemsInput = typeof GetProfileItemsInput.Type;

/**
 * One page of Live, newest first: the last `days` days in the viewer's zone
 * (today counts as one), for the `scope`'s people.
 */
export const GetLiveInput = Schema.Struct({
  days: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: LIVE_MAX_DAYS })),
  scope: LiveScope,
  cursor: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(PROFILE_ITEMS_CURSOR_MAX_LENGTH))),
});
export type GetLiveInput = typeof GetLiveInput.Type;

/**
 * One page of a diary, newest day first. `cursor` is the previous page's
 * `nextCursor` (its oldest day); `from` starts the page on that day or the
 * nearest earlier one with entries (jump to a date).
 */
export const GetDiaryInput = Schema.Struct({
  username: UsernameInput,
  cursor: Schema.optionalKey(LocalDate),
  from: Schema.optionalKey(LocalDate),
});
export type GetDiaryInput = typeof GetDiaryInput.Type;

/** The contribution graph's days, defaulting to the last 53 Sunday-starting weeks in the owner's zone. */
export const GetContributionGraphInput = Schema.Struct({
  username: UsernameInput,
  from: Schema.optionalKey(LocalDate),
  to: Schema.optionalKey(LocalDate),
});
export type GetContributionGraphInput = typeof GetContributionGraphInput.Type;

export const GetLeaderboardInput = Schema.Struct({
  scope: LeaderboardScope,
  period: LeaderboardPeriod,
});
export type GetLeaderboardInput = typeof GetLeaderboardInput.Type;

/** The user types their username to confirm. */
export const DeleteAccountInput = Schema.Struct({
  confirmUsername: Schema.String.check(Schema.isMaxLength(DELETE_ACCOUNT_CONFIRM_MAX_LENGTH)),
});
export type DeleteAccountInput = typeof DeleteAccountInput.Type;

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

export class Goal extends Schema.Class<Goal>("Goal")({
  id: Schema.String,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  progressMode: GoalProgressMode,
  /** 0–100, two decimals. Derived from the counts for `count` goals (`goalPercent`). */
  progressPercent: Schema.Number,
  /** Set exactly for `count` goals. `currentCount` can pass the target. */
  targetCount: Schema.NullOr(Schema.Number),
  currentCount: Schema.NullOr(Schema.Number),
  targetDate: Schema.NullOr(LocalDate),
  status: GoalStatus,
  /** Set exactly when `status` is `completed`. */
  completedAt: Schema.NullOr(Schema.Date),
  privacy: Privacy,
  shareToLive: Schema.Boolean,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}

export class GoalLink extends Schema.Class<GoalLink>("GoalLink")({
  id: Schema.String,
  goalId: Schema.String,
  itemType: GoalLinkItem,
  itemId: Schema.String,
  amount: Schema.Number,
  /** The habit's or task's title, read when listed. */
  itemTitle: Schema.String,
  createdAt: Schema.Date,
}) {}

/** One change to a goal's progress, in its own unit (percent points or count). */
export class GoalProgressEvent extends Schema.Class<GoalProgressEvent>("GoalProgressEvent")({
  id: Schema.String,
  delta: Schema.Number,
  valueAfter: Schema.Number,
  source: GoalProgressSource,
  /** The habit or task, for linked changes. */
  sourceId: Schema.NullOr(Schema.String),
  /** The check-in's day, for habit changes. */
  sourceDate: Schema.NullOr(LocalDate),
  createdAt: Schema.Date,
}) {}

/** `/goals` and `GetGoal`: a goal with its links and its latest progress events (newest first). */
export class GoalSummary extends Schema.Class<GoalSummary>("GoalSummary")({
  goal: Goal,
  links: Schema.Array(GoalLink),
  events: Schema.Array(GoalProgressEvent),
}) {}

/**
 * `/now`'s goals for a day: `active` ones (created on or before it), oldest
 * first, and the ones `completed` that day. Paused goals are left out.
 */
export class GoalsForDay extends Schema.Class<GoalsForDay>("GoalsForDay")({
  date: LocalDate,
  active: Schema.Array(Goal),
  completed: Schema.Array(Goal),
}) {}

/** A goal a habit or task is linked to, with the link. */
export class ItemGoal extends Schema.Class<ItemGoal>("ItemGoal")({
  goal: Goal,
  link: GoalLink,
}) {}

export class Note extends Schema.Class<Note>("Note")({
  id: Schema.String,
  body: Schema.String,
  /** The user's local day when it was written. */
  localDate: LocalDate,
  privacy: Privacy,
  shareToLive: Schema.Boolean,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}

/** A day's notes, oldest first. */
export class NotesForDay extends Schema.Class<NotesForDay>("NotesForDay")({
  date: LocalDate,
  notes: Schema.Array(Note),
}) {}

/** One day's notes in a `NotePage`, newest first. */
export class NoteDay extends Schema.Class<NoteDay>("NoteDay")({
  date: LocalDate,
  notes: Schema.Array(Note),
}) {}

/**
 * A page of `ListNotes`, grouped by day, newest day first. Pages split by
 * note, so a day can continue on the next page: merge it into the last group.
 */
export class NotePage extends Schema.Class<NotePage>("NotePage")({
  days: Schema.Array(NoteDay),
  /** `null` on the last page. */
  nextCursor: Schema.NullOr(Schema.String),
}) {}

export class FocusSession extends Schema.Class<FocusSession>("FocusSession")({
  id: Schema.String,
  label: Schema.NullOr(Schema.String),
  /** The planned length, extends included. */
  plannedMinutes: Schema.Number,
  status: SessionStatus,
  /** The user's local day when it started. */
  localDate: LocalDate,
  startedAt: Schema.Date,
  /** Set exactly while `running`: when the time runs out. Count down from it. */
  endsAt: Schema.NullOr(Schema.Date),
  /** Set exactly once `completed` or `stopped`. */
  endedAt: Schema.NullOr(Schema.Date),
  /** Time spent running (the sum of its segments), as of the response. */
  elapsedMs: Schema.Number,
  /** Planned time not yet spent, as of the response; 0 once ended. */
  remainingMs: Schema.Number,
  privacy: Privacy,
  shareToLive: Schema.Boolean,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}

/** A day's sessions, oldest first, with the minutes focused that day (whole minutes, rounded down). */
export class SessionsForDay extends Schema.Class<SessionsForDay>("SessionsForDay")({
  date: LocalDate,
  focusedMinutes: Schema.Number,
  sessions: Schema.Array(FocusSession),
}) {}

/**
 * One day in a `SessionPage`, newest session first. `focusedMinutes` counts
 * every session that day, including ones on the next page.
 */
export class SessionDay extends Schema.Class<SessionDay>("SessionDay")({
  date: LocalDate,
  focusedMinutes: Schema.Number,
  sessions: Schema.Array(FocusSession),
}) {}

/**
 * A page of `ListSessions`, grouped by day, newest day first. Pages split by
 * session, so a day can continue on the next page: merge it into the last group.
 */
export class SessionPage extends Schema.Class<SessionPage>("SessionPage")({
  days: Schema.Array(SessionDay),
  /** `null` on the last page. */
  nextCursor: Schema.NullOr(Schema.String),
}) {}

/** `/now`'s whole day in one answer: what the per-day lists return, together. */
export class Day extends Schema.Class<Day>("Day")({
  date: LocalDate,
  tasks: TasksForDay,
  /** Open tasks with no dates (on every day), plus those settled on `date`. */
  unscheduled: UnscheduledTasks,
  habits: HabitsForDay,
  goals: GoalsForDay,
  sessions: SessionsForDay,
  notesCount: Schema.Number,
}) {}

/**
 * A habit on an Upcoming day. Flexible habits show once per period, on its
 * first scheduled day in the range, so `progress` names the period ("3 this
 * week") and carries the taps already in it.
 */
export class UpcomingHabit extends Schema.Class<UpcomingHabit>("UpcomingHabit")({
  habit: Habit,
  schedule: Schema.String,
  progress: HabitProgress,
}) {}

/** One day of Upcoming: open tasks assigned or due, habits scheduled, active goals with that target date. */
export class UpcomingDay extends Schema.Class<UpcomingDay>("UpcomingDay")({
  date: LocalDate,
  tasks: Schema.Array(DayTask),
  habits: Schema.Array(UpcomingHabit),
  goals: Schema.Array(Goal),
}) {}

/** The days of `[from, until)` with something on them, oldest first; empty days are left out. */
export class Upcoming extends Schema.Class<Upcoming>("Upcoming")({
  from: LocalDate,
  /** The first day after the range: the next page's `from`. */
  until: LocalDate,
  days: Schema.Array(UpcomingDay),
}) {}

/** Another user as lists and search show them. */
export class Person extends Schema.Class<Person>("Person")({
  username: Schema.String,
  name: Schema.String,
  /** The Google picture URL; load it with `referrerPolicy="no-referrer"`. */
  image: Schema.NullOr(Schema.String),
}) {}

export class Connection extends Schema.Class<Connection>("Connection")({
  person: Person,
  since: Schema.Date,
}) {}

/** A pending request, incoming (`person` sent it) or outgoing (sent to `person`). */
export class ConnectionRequest extends Schema.Class<ConnectionRequest>("ConnectionRequest")({
  id: Schema.String,
  person: Person,
  createdAt: Schema.Date,
}) {}

export class BlockedPerson extends Schema.Class<BlockedPerson>("BlockedPerson")({
  person: Person,
  since: Schema.Date,
}) {}

/** Where the viewer stands with someone, and the pending request between them if any. */
export class SocialStatus extends Schema.Class<SocialStatus>("SocialStatus")({
  state: ConnectionState,
  /** Set for `pending_in` (to accept or decline) and `pending_out` (to cancel). */
  requestId: Schema.NullOr(Schema.String),
}) {}

export class PersonResult extends Schema.Class<PersonResult>("PersonResult")({
  person: Person,
  status: SocialStatus,
}) {}

/** All-time totals anyone may see; the contribution graph counts private items too. */
export class ProfileCounts extends Schema.Class<ProfileCounts>("ProfileCounts")({
  connections: Schema.Number,
  /** All-time points (`points-rules.ts`). */
  points: Schema.Number,
  tasksSettled: Schema.Number,
  habitsCompleted: Schema.Number,
  goalsCompleted: Schema.Number,
  sessionsCompleted: Schema.Number,
}) {}

/** `/@username`. A viewer who blocked them gets the card without counts. */
export class Profile extends Schema.Class<Profile>("Profile")({
  person: Person,
  joinedAt: Schema.Date,
  /** The owner's user color (`Settings.color`), or `null` before their first app load. */
  color: Schema.NullOr(UserColor),
  status: SocialStatus,
  counts: Schema.NullOr(ProfileCounts),
}) {}

/**
 * A completed item (or a note, in the diary) on a profile tab. Only what the
 * viewer may see comes back; `privacy` lets the owner see who else can.
 */
export class ProfileItem extends Schema.Class<ProfileItem>("ProfileItem")({
  /** The activity row's id. */
  id: Schema.String,
  kind: ActivityKind,
  /** The task's or habit's title, the goal's name, the session's label (may be `null`) or the note's body. */
  title: Schema.NullOr(Schema.String),
  localDate: LocalDate,
  occurredAt: Schema.Date,
  privacy: Privacy,
  /** Sessions only. */
  plannedMinutes: Schema.NullOr(Schema.Number),
}) {}

export class ProfileItemPage extends Schema.Class<ProfileItemPage>("ProfileItemPage")({
  items: Schema.Array(ProfileItem),
  nextCursor: Schema.NullOr(Schema.String),
}) {}

export class LeaderboardEntry extends Schema.Class<LeaderboardEntry>("LeaderboardEntry")({
  /** Ties share a rank (1, 2, 2, 4). */
  rank: Schema.Number,
  person: Person,
  points: Schema.Number,
}) {}

export class Leaderboard extends Schema.Class<Leaderboard>("Leaderboard")({
  /** The top `LEADERBOARD_SIZE` ranks, plus the viewer's own row wherever it falls. */
  entries: Schema.Array(LeaderboardEntry),
  /** The viewer's place, or `null` with no points in the period. */
  me: Schema.NullOr(LeaderboardEntry),
  /** The period's first day in the viewer's zone, `null` for all time. */
  from: Schema.NullOr(LocalDate),
}) {}

/** Who did something on Live. */
export class LiveActor extends Schema.Class<LiveActor>("LiveActor")({
  username: Schema.String,
  name: Schema.String,
  /** The Google picture URL; load it with `referrerPolicy="no-referrer"`. */
  image: Schema.NullOr(Schema.String),
  /** Their user color, or `null` before their first app load. */
  color: Schema.NullOr(UserColor),
}) {}

/** Kind-specific numbers for a Live event; unset ones are `null`. */
export class LiveEventMeta extends Schema.Class<LiveEventMeta>("LiveEventMeta")({
  /** `goal_progressed`: the goal's percent after the day's changes. */
  percent: Schema.NullOr(Schema.Number),
  /** `goal_progressed`: whether the day left the goal higher than it started. */
  rose: Schema.NullOr(Schema.Boolean),
  /** Sessions: the planned length when started or completed, the time focused when stopped. */
  minutes: Schema.NullOr(Schema.Number),
  /** `habit_checked`: taps that day. */
  count: Schema.NullOr(Schema.Number),
}) {}

/**
 * One event on Live. `title` is `null` when `display` is `redacted` (and for
 * sessions without a label); the item's current privacy and share flag
 * decide both, so a change applies at once.
 */
export class LiveEvent extends Schema.Class<LiveEvent>("LiveEvent")({
  /** The activity row's id. */
  id: Schema.String,
  actor: LiveActor,
  /** The viewer's own event. */
  mine: Schema.Boolean,
  kind: ActivityKind,
  occurredAt: Schema.Date,
  display: LiveDisplay,
  title: Schema.NullOr(Schema.String),
  meta: LiveEventMeta,
}) {}

export class LivePage extends Schema.Class<LivePage>("LivePage")({
  events: Schema.Array(LiveEvent),
  /** Older events, or `null` at the start of the window. */
  nextCursor: Schema.NullOr(Schema.String),
  /** Whether the viewer has any connections (the empty state points to people search when not). */
  hasConnections: Schema.Boolean,
}) {}

/** One diary entry: an activity row joined to its item. */
export class DiaryEntry extends Schema.Class<DiaryEntry>("DiaryEntry")({
  /** The activity row's id. */
  id: Schema.String,
  kind: ActivityKind,
  /** The task's or habit's title, the goal's name, the session's label (may be `null`) or the note's body. */
  title: Schema.NullOr(Schema.String),
  occurredAt: Schema.Date,
  privacy: Privacy,
  /** Goal moves carry `percent` and `rose`; sessions `minutes` (planned when completed, focused when stopped). */
  meta: LiveEventMeta,
}) {}

export class DiaryDay extends Schema.Class<DiaryDay>("DiaryDay")({
  /** The owner's local day. */
  date: LocalDate,
  /** Newest first. */
  entries: Schema.Array(DiaryEntry),
}) {}

export class DiaryPage extends Schema.Class<DiaryPage>("DiaryPage")({
  days: Schema.Array(DiaryDay),
  /** Pass as `cursor` for older days; `null` at the diary's start. */
  nextCursor: Schema.NullOr(LocalDate),
}) {}

export class ContributionDay extends Schema.Class<ContributionDay>("ContributionDay")({
  date: LocalDate,
  count: Schema.Number,
}) {}

/**
 * Counts per local day of settled tasks, completed habits, completed goals
 * and completed sessions, private ones included. No titles, kinds or
 * privacy: the graph never says what was done.
 */
export class ContributionGraph extends Schema.Class<ContributionGraph>("ContributionGraph")({
  /** A Sunday. */
  from: LocalDate,
  to: LocalDate,
  /** The owner's today. */
  today: LocalDate,
  /** Days with a count above zero, oldest first. */
  days: Schema.Array(ContributionDay),
  total: Schema.Number,
}) {}

/** Kind-specific numbers for a Path step; unset ones are `null`. */
export class PathEventMeta extends Schema.Class<PathEventMeta>("PathEventMeta")({
  /** `goal_progressed`: the goal's percent after today's changes. */
  percent: Schema.NullOr(Schema.Number),
  /** `goal_progressed`: whether today left the goal higher than it started. */
  rose: Schema.NullOr(Schema.Boolean),
  /** `session_completed`: its planned length. */
  minutes: Schema.NullOr(Schema.Number),
  /** `habit_checked`: taps today. */
  count: Schema.NullOr(Schema.Number),
}) {}

/**
 * One step of the viewer's Path: something they got done today, whatever
 * its privacy or share flag (it's only ever shown to them). A habit appears
 * once, at its last tap; a goal once, at its last change.
 */
export class PathEvent extends Schema.Class<PathEvent>("PathEvent")({
  /** The activity row's or check-in's id. */
  id: Schema.String,
  kind: PathKind,
  occurredAt: Schema.Date,
  /** The task's or habit's title, the goal's name or the session's label (may be `null`). */
  title: Schema.NullOr(Schema.String),
  meta: PathEventMeta,
}) {}

/** The viewer's Path for today, oldest first. */
export class Path extends Schema.Class<Path>("Path")({
  date: LocalDate,
  events: Schema.Array(PathEvent),
}) {}

export class SocialOverview extends Schema.Class<SocialOverview>("SocialOverview")({
  connections: Schema.Array(Connection),
  incoming: Schema.Array(ConnectionRequest),
  outgoing: Schema.Array(ConnectionRequest),
  blocked: Schema.Array(BlockedPerson),
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

export class GoalNotFound extends Schema.TaggedError<GoalNotFound>()("GoalNotFound", {
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

export class NoteNotFound extends Schema.TaggedError<NoteNotFound>()("NoteNotFound", {
  message: Schema.String,
  id: Schema.String,
}) {}

/** More than 50 notes on one local day. */
export class NoteLimitReached extends Schema.TaggedError<NoteLimitReached>()("NoteLimitReached", {
  message: Schema.String,
  limit: Schema.Number,
}) {}

export class SessionNotFound extends Schema.TaggedError<SessionNotFound>()("SessionNotFound", {
  message: Schema.String,
  id: Schema.String,
}) {}

/**
 * Starting a session while another is running or paused, without
 * `replaceActive`. Carries that session so the client can ask to replace it.
 */
export class ActiveSessionExists extends Schema.TaggedError<ActiveSessionExists>()(
  "ActiveSessionExists",
  {
    message: Schema.String,
    session: FocusSession,
  },
) {}

/**
 * No onboarded user has that username, or they blocked the viewer: the two
 * look the same, so a block is never revealed.
 */
export class UserNotFound extends Schema.TaggedError<UserNotFound>()("UserNotFound", {
  message: Schema.String,
  username: Schema.String,
}) {}

/** Not pending any more, or not addressed to (or sent by) the user. */
export class ConnectionRequestNotFound extends Schema.TaggedError<ConnectionRequestNotFound>()(
  "ConnectionRequestNotFound",
  { message: Schema.String, id: Schema.String },
) {}

export const CONNECTION_REFUSAL = ["self", "already_connected", "blocked"] as const;
export type ConnectionRefusal = (typeof CONNECTION_REFUSAL)[number];

/** Connecting with (or blocking) yourself, connecting with someone you blocked, or connecting twice. */
export class ConnectionNotAllowed extends Schema.TaggedError<ConnectionNotAllowed>()(
  "ConnectionNotAllowed",
  { message: Schema.String, reason: Schema.Literals(CONNECTION_REFUSAL) },
) {}

/** Too many connection requests or searches in a short time, or past the daily cap. */
export class SocialLimitReached extends Schema.TaggedError<SocialLimitReached>()(
  "SocialLimitReached",
  { message: Schema.String },
) {}

/** Pausing a paused session, resuming a running one, or changing one that has ended. Carries its status now. */
export class SessionTransitionNotAllowed extends Schema.TaggedError<SessionTransitionNotAllowed>()(
  "SessionTransitionNotAllowed",
  {
    message: Schema.String,
    status: SessionStatus,
  },
) {}

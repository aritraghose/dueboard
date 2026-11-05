import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { LocalDate } from "./dates.ts";
import { NOTIFICATION_KIND } from "./notification-constants.ts";
import { RELAY_MESSAGE_MAX_LENGTH, RELAY_STATUS } from "./relay-constants.ts";
import { TIBO_EVENING_TIMES, TIBO_MORNING_TIMES } from "./tibo-constants.ts";
import {
  ASK_DOCUMENT_MAX_LENGTH,
  ASK_DOCUMENT_NAME_MAX_LENGTH,
  ASK_INSTRUCTIONS_MAX_LENGTH,
  ASK_MONTHLY_ANSWER_CAP_MAX,
  ASK_SHARED_CONTEXT_MAX_LENGTH,
} from "./ask-constants.ts";

export const PRIVACY = ["public", "connections", "private"] as const;
export const Privacy = Schema.Literals(PRIVACY);
export type Privacy = typeof Privacy.Type;

export const RELAY_POLICY = ["connections", "anyone", "none"] as const;
export const RelayPolicy = Schema.Literals(RELAY_POLICY);
export type RelayPolicy = typeof RelayPolicy.Type;

export * from "./tibo-constants.ts";
export * from "./relay-constants.ts";
export const TiboMorningTime = Schema.Literals(TIBO_MORNING_TIMES);
export type TiboMorningTime = typeof TiboMorningTime.Type;
export const TiboEveningTime = Schema.Literals(TIBO_EVENING_TIMES);
export type TiboEveningTime = typeof TiboEveningTime.Type;

export const SYSTEM_TAG_KIND = ["default", "habit", "goal"] as const;
export const SystemTagKind = Schema.Literals(SYSTEM_TAG_KIND);
export type SystemTagKind = typeof SystemTagKind.Type;

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

export const USER_COLOR = TAG_COLOR.filter(
  (color): color is Exclude<TagColor, "gray"> => color !== "gray",
);
export const UserColor = Schema.Literals(USER_COLOR);
export type UserColor = typeof UserColor.Type;

export const TASK_STATUS = ["idle", "working", "settled"] as const;
export const TaskStatus = Schema.Literals(TASK_STATUS);
export type TaskStatus = typeof TaskStatus.Type;

export const TASK_DATE_ROLE = ["assigned", "deadline", "both"] as const;
export const TaskDateRole = Schema.Literals(TASK_DATE_ROLE);
export type TaskDateRole = typeof TaskDateRole.Type;

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

export const GOAL_PROGRESS_MODE = ["slider", "count"] as const;
export const GoalProgressMode = Schema.Literals(GOAL_PROGRESS_MODE);
export type GoalProgressMode = typeof GoalProgressMode.Type;

export const GOAL_STATUS = ["active", "paused", "completed"] as const;
export const GoalStatus = Schema.Literals(GOAL_STATUS);
export type GoalStatus = typeof GoalStatus.Type;

export const GOAL_LINK_ITEM = ["habit", "task"] as const;
export const GoalLinkItem = Schema.Literals(GOAL_LINK_ITEM);
export type GoalLinkItem = typeof GoalLinkItem.Type;

export const GOAL_PROGRESS_SOURCE = ["manual", "habit", "task"] as const;
export const GoalProgressSource = Schema.Literals(GOAL_PROGRESS_SOURCE);
export type GoalProgressSource = typeof GoalProgressSource.Type;

export const ACTIVITY_SUBJECT = ["task", "habit", "goal", "session", "note"] as const;
export type ActivitySubject = (typeof ACTIVITY_SUBJECT)[number];

export const LIVE_DISPLAY = ["full", "redacted"] as const;
export const LiveDisplay = Schema.Literals(LIVE_DISPLAY);
export type LiveDisplay = typeof LiveDisplay.Type;

export const LIVE_SCOPE = ["all", "connections", "mine"] as const;
export const LiveScope = Schema.Literals(LIVE_SCOPE);
export type LiveScope = typeof LiveScope.Type;

export const PATH_KIND = ["task_settled", "habit_checked", "goal_progressed", "session_completed"] as const;
export const PathKind = Schema.Literals(PATH_KIND);
export type PathKind = typeof PathKind.Type;

export const SESSION_STATUS = ["running", "paused", "completed", "stopped"] as const;
export const SessionStatus = Schema.Literals(SESSION_STATUS);
export type SessionStatus = typeof SessionStatus.Type;

export const SESSION_ACTION = ["pause", "resume", "extend", "stop"] as const;
export type SessionAction = (typeof SESSION_ACTION)[number];

export const CONNECTION_REQUEST_STATUS = ["pending", "accepted", "declined", "cancelled"] as const;
export type ConnectionRequestStatus = (typeof CONNECTION_REQUEST_STATUS)[number];

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

export const PROFILE_FEED = ["tasks", "habits", "goals", "sessions"] as const;
export const ProfileFeed = Schema.Literals(PROFILE_FEED);
export type ProfileFeed = typeof ProfileFeed.Type;

export const LEADERBOARD_SCOPE = ["connections", "public"] as const;
export const LeaderboardScope = Schema.Literals(LEADERBOARD_SCOPE);
export type LeaderboardScope = typeof LeaderboardScope.Type;

export const LEADERBOARD_PERIOD = ["all", "month", "week", "today"] as const;
export const LeaderboardPeriod = Schema.Literals(LEADERBOARD_PERIOD);
export type LeaderboardPeriod = typeof LeaderboardPeriod.Type;

export const AI_USAGE_REASON = ["tibo_reply", "tibo_proactive", "relay", "ask_answer", "tibo_image"] as const;
export const AiUsageReason = Schema.Literals(AI_USAGE_REASON);
export type AiUsageReason = typeof AiUsageReason.Type;

export const RelayStatus = Schema.Literals(RELAY_STATUS);
export type RelayStatus = typeof RelayStatus.Type;

export const TAG_NAME_MAX_LENGTH = 30;
export const MAX_TAGS_PER_USER = 50;
export const TIME_ZONE_MAX_LENGTH = 64;

export const TASK_TITLE_MAX_LENGTH = 200;
export const TASK_DESCRIPTION_MAX_LENGTH = 2000;
export const TASK_IMPORTANCE_MAX = 5;
export const TASK_EXPECTED_MINUTES_MAX = 1440;
export const TASK_SEARCH_MAX_LENGTH = 200;
export const TASK_PAGE_SIZE_DEFAULT = 50;
export const TASK_PAGE_SIZE_MAX = 100;
export const TASK_CURSOR_MAX_LENGTH = 128;

export const HABIT_TITLE_MAX_LENGTH = 200;
export const HABIT_DESCRIPTION_MAX_LENGTH = 2000;
export const HABIT_TARGET_MAX = 100;
export const HABIT_PERIOD_LENGTH_MAX = 365;
export const HABIT_CHECKIN_DAYS_BACK = 30;
export const HABIT_HISTORY_WEEKS = 12;

export const GOAL_NAME_MAX_LENGTH = 200;
export const GOAL_DESCRIPTION_MAX_LENGTH = 2000;
export const GOAL_COUNT_MAX = 1_000_000;
export const GOAL_LINK_AMOUNT_MAX = 1000;
export const GOAL_LINKS_MAX = 50;
export const GOAL_EVENTS_IN_LIST = 10;
export const GOAL_EVENTS_IN_DETAIL = 50;

export const NOTE_BODY_MAX_LENGTH = 60;
export const MAX_NOTES_PER_DAY = 50;
export const NOTE_SEARCH_MAX_LENGTH = 60;
export const NOTE_PAGE_SIZE_DEFAULT = 50;
export const NOTE_PAGE_SIZE_MAX = 100;
export const NOTE_CURSOR_MAX_LENGTH = 160;

export const SESSION_LABEL_MAX_LENGTH = 100;
export const SESSION_MINUTES_MAX = 600;
export const SESSION_PAGE_SIZE_DEFAULT = 30;
export const SESSION_PAGE_SIZE_MAX = 100;
export const SESSION_CURSOR_MAX_LENGTH = 160;
export const UPCOMING_DAYS_MAX = 60;

export const USERNAME_MIN_LENGTH = 4;
export const USERNAME_MAX_LENGTH = 15;
/** Handles issued before the Twitter-style rules ran up to 30 characters; lookups still accept them. */
export const HANDLE_LOOKUP_MAX_LENGTH = 30;
export const CONNECTION_REQUESTS_PER_DAY = 20;
export const PEOPLE_SEARCH_MIN_LENGTH = 2;
export const PEOPLE_SEARCH_LIMIT = 10;
export const PROFILE_ITEMS_PAGE_SIZE = 30;
export const PROFILE_ITEMS_CURSOR_MAX_LENGTH = 128;
export const PEOPLE_SEARCH_MAX_LENGTH = 60;
export const LEADERBOARD_SIZE = 50;
export const LIVE_PAGE_SIZE = 30;
export const LIVE_MAX_DAYS = 7;
export const DELETE_ACCOUNT_CONFIRM_MAX_LENGTH = 64;
export * from "./usage-constants.ts";

export const TagName = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isBetweenLength(1, TAG_NAME_MAX_LENGTH),
);

export const Id = Schema.String.check(Schema.isBetweenLength(1, 64));

export const SettingsPatch = Schema.Struct({
  defaultPrivacy: Schema.optionalKey(Privacy),
  defaultShareToLive: Schema.optionalKey(Schema.Boolean),
  relayPolicy: Schema.optionalKey(RelayPolicy),
  tiboProactive: Schema.optionalKey(Schema.Boolean),
  tiboMorningPlan: Schema.optionalKey(Schema.Boolean),
  tiboMorningTime: Schema.optionalKey(TiboMorningTime),
  tiboDeadlineNudges: Schema.optionalKey(Schema.Boolean),
  tiboHabitCheck: Schema.optionalKey(Schema.Boolean),
  tiboEveningTime: Schema.optionalKey(TiboEveningTime),
});
export type SettingsPatch = typeof SettingsPatch.Type;

export const TIBO_PROACTIVE_KEYS = [
  "tiboProactive",
  "tiboMorningPlan",
  "tiboMorningTime",
  "tiboDeadlineNudges",
  "tiboHabitCheck",
  "tiboEveningTime",
] as const satisfies readonly (keyof SettingsPatch)[];

export const CreateTagInput = Schema.Struct({ name: TagName, color: TagColor });
export type CreateTagInput = typeof CreateTagInput.Type;

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
export const TaskImportance = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: TASK_IMPORTANCE_MAX }));
export const TaskExpectedMinutes = Schema.Int.check(
  Schema.isBetween({ minimum: 1, maximum: TASK_EXPECTED_MINUTES_MAX }),
);

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
  settledOn: Schema.optionalKey(LocalDate),
});
export type ListUnscheduledTasksInput = typeof ListUnscheduledTasksInput.Type;

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

export const GoalName = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isBetweenLength(1, GOAL_NAME_MAX_LENGTH),
);
export const GoalDescription = Schema.String.check(Schema.isMaxLength(GOAL_DESCRIPTION_MAX_LENGTH));
export const GoalTargetCount = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: GOAL_COUNT_MAX }));
export const GoalValue = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: GOAL_COUNT_MAX }));
export const GoalLinkAmount = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: GOAL_LINK_AMOUNT_MAX }));

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

export const SetGoalProgressInput = Schema.Struct({ id: Id, value: GoalValue });
export type SetGoalProgressInput = typeof SetGoalProgressInput.Type;

export const AdjustGoalProgressInput = Schema.Struct({
  id: Id,
  delta: Schema.Finite.check(Schema.isBetween({ minimum: -GOAL_COUNT_MAX, maximum: GOAL_COUNT_MAX })),
});
export type AdjustGoalProgressInput = typeof AdjustGoalProgressInput.Type;

export const LinkGoalItemInput = Schema.Struct({
  goalId: Id,
  itemType: GoalLinkItem,
  itemId: Id,
  amount: Schema.optionalKey(GoalLinkAmount),
});
export type LinkGoalItemInput = typeof LinkGoalItemInput.Type;

export const UnlinkGoalItemInput = Schema.Struct({ goalId: Id, itemType: GoalLinkItem, itemId: Id });
export type UnlinkGoalItemInput = typeof UnlinkGoalItemInput.Type;

export const ListGoalsInput = Schema.Struct({
  status: Schema.optionalKey(Schema.Array(GoalStatus).check(Schema.isMaxLength(GOAL_STATUS.length))),
});
export type ListGoalsInput = typeof ListGoalsInput.Type;

export const GoalItemRef = Schema.Struct({ itemType: GoalLinkItem, itemId: Id });
export type GoalItemRef = typeof GoalItemRef.Type;

export const NoteBody = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isBetweenLength(1, NOTE_BODY_MAX_LENGTH),
  Schema.makeFilter((value: string) => !/[\r\n]/.test(value) || "A note is a single line"),
);

export const CreateNoteInput = Schema.Struct({
  body: NoteBody,
  date: Schema.optionalKey(LocalDate),
  privacy: Schema.optionalKey(Privacy),
  shareToLive: Schema.optionalKey(Schema.Boolean),
});
export type CreateNoteInput = typeof CreateNoteInput.Type;

export const UpdateNoteInput = Schema.Struct({
  id: Id,
  body: Schema.optionalKey(NoteBody),
  privacy: Schema.optionalKey(Privacy),
  shareToLive: Schema.optionalKey(Schema.Boolean),
});
export type UpdateNoteInput = typeof UpdateNoteInput.Type;

export const ListNotesInput = Schema.Struct({
  query: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(NOTE_SEARCH_MAX_LENGTH))),
  cursor: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(NOTE_CURSOR_MAX_LENGTH))),
  limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: NOTE_PAGE_SIZE_MAX }))),
});
export type ListNotesInput = typeof ListNotesInput.Type;

export const SessionMinutes = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: SESSION_MINUTES_MAX }));

export const SessionLabel = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isBetweenLength(1, SESSION_LABEL_MAX_LENGTH),
  Schema.makeFilter((value: string) => !/[\r\n]/.test(value) || "A label is a single line"),
);

export const StartSessionInput = Schema.Struct({
  minutes: SessionMinutes,
  label: Schema.optionalKey(SessionLabel),
  privacy: Schema.optionalKey(Privacy),
  shareToLive: Schema.optionalKey(Schema.Boolean),
  replaceActive: Schema.optionalKey(Schema.Boolean),
});
export type StartSessionInput = typeof StartSessionInput.Type;

export const ExtendSessionInput = Schema.Struct({ id: Id, minutes: SessionMinutes });
export type ExtendSessionInput = typeof ExtendSessionInput.Type;

export const ListSessionsInput = Schema.Struct({
  cursor: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(SESSION_CURSOR_MAX_LENGTH))),
  limit: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: SESSION_PAGE_SIZE_MAX })),
  ),
});
export type ListSessionsInput = typeof ListSessionsInput.Type;

export const GetUpcomingInput = Schema.Struct({
  from: LocalDate,
  days: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: UPCOMING_DAYS_MAX })),
});
export type GetUpcomingInput = typeof GetUpcomingInput.Type;

export const UsernameInput = Schema.String.check(Schema.isBetweenLength(1, HANDLE_LOOKUP_MAX_LENGTH + 1));

export const UsernameRef = Schema.Struct({ username: UsernameInput });
export type UsernameRef = typeof UsernameRef.Type;

export const ConnectionRequestRef = Schema.Struct({ requestId: Id });
export type ConnectionRequestRef = typeof ConnectionRequestRef.Type;

export const SearchPeopleInput = Schema.Struct({
  query: Schema.String.check(Schema.isMaxLength(PEOPLE_SEARCH_MAX_LENGTH)),
});
export type SearchPeopleInput = typeof SearchPeopleInput.Type;

export const GetProfileItemsInput = Schema.Struct({
  username: UsernameInput,
  feed: ProfileFeed,
  cursor: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(PROFILE_ITEMS_CURSOR_MAX_LENGTH))),
});
export type GetProfileItemsInput = typeof GetProfileItemsInput.Type;

export const GetLiveInput = Schema.Struct({
  days: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: LIVE_MAX_DAYS })),
  scope: LiveScope,
  cursor: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(PROFILE_ITEMS_CURSOR_MAX_LENGTH))),
});
export type GetLiveInput = typeof GetLiveInput.Type;

export const GetDiaryInput = Schema.Struct({
  username: UsernameInput,
  cursor: Schema.optionalKey(LocalDate),
  from: Schema.optionalKey(LocalDate),
});
export type GetDiaryInput = typeof GetDiaryInput.Type;

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

export const DeleteAccountInput = Schema.Struct({
  confirmUsername: Schema.String.check(Schema.isMaxLength(DELETE_ACCOUNT_CONFIRM_MAX_LENGTH)),
});
export type DeleteAccountInput = typeof DeleteAccountInput.Type;

export const decodeInput =
  <S extends Schema.Decoder<unknown>>(schema: S) =>
  (input: unknown): Effect.Effect<S["Type"], InvalidInput, S["DecodingServices"]> =>
    Schema.decodeUnknownEffect(schema)(input).pipe(
      Effect.mapError((error) => new InvalidInput({ message: error.message })),
    );

export class Settings extends Schema.Class<Settings>("Settings")({
  timeZone: Schema.String,
  color: UserColor,
  defaultPrivacy: Privacy,
  defaultShareToLive: Schema.Boolean,
  relayPolicy: RelayPolicy,
  tiboProactive: Schema.Boolean,
  tiboMorningPlan: Schema.Boolean,
  tiboMorningTime: TiboMorningTime,
  tiboDeadlineNudges: Schema.Boolean,
  tiboHabitCheck: Schema.Boolean,
  tiboEveningTime: TiboEveningTime,
}) {}

export class Tag extends Schema.Class<Tag>("Tag")({
  id: Schema.String,
  name: Schema.String,
  color: TagColor,
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
  settledAt: Schema.NullOr(Schema.Date),
  privacy: Privacy,
  shareToLive: Schema.Boolean,
  importance: Schema.NullOr(Schema.Number),
  expectedMinutes: Schema.NullOr(Schema.Number),
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}

export class DayTask extends Schema.Class<DayTask>("DayTask")({
  task: Task,
  role: TaskDateRole,
}) {}

export class TasksForDay extends Schema.Class<TasksForDay>("TasksForDay")({
  date: LocalDate,
  open: Schema.Array(DayTask),
  settled: Schema.Array(DayTask),
}) {}

export class UnscheduledTasks extends Schema.Class<UnscheduledTasks>("UnscheduledTasks")({
  open: Schema.Array(Task),
  settled: Schema.Array(Task),
}) {}

export class TaskPage extends Schema.Class<TaskPage>("TaskPage")({
  tasks: Schema.Array(Task),
  nextCursor: Schema.NullOr(Schema.String),
}) {}

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

export class Goal extends Schema.Class<Goal>("Goal")({
  id: Schema.String,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  progressMode: GoalProgressMode,
  progressPercent: Schema.Number,
  targetCount: Schema.NullOr(Schema.Number),
  currentCount: Schema.NullOr(Schema.Number),
  targetDate: Schema.NullOr(LocalDate),
  status: GoalStatus,
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
  itemTitle: Schema.String,
  createdAt: Schema.Date,
}) {}

export class GoalProgressEvent extends Schema.Class<GoalProgressEvent>("GoalProgressEvent")({
  id: Schema.String,
  delta: Schema.Number,
  valueAfter: Schema.Number,
  source: GoalProgressSource,
  sourceId: Schema.NullOr(Schema.String),
  sourceDate: Schema.NullOr(LocalDate),
  createdAt: Schema.Date,
}) {}

export class GoalSummary extends Schema.Class<GoalSummary>("GoalSummary")({
  goal: Goal,
  links: Schema.Array(GoalLink),
  events: Schema.Array(GoalProgressEvent),
}) {}

export class GoalsForDay extends Schema.Class<GoalsForDay>("GoalsForDay")({
  date: LocalDate,
  active: Schema.Array(Goal),
  completed: Schema.Array(Goal),
}) {}

export class ItemGoal extends Schema.Class<ItemGoal>("ItemGoal")({
  goal: Goal,
  link: GoalLink,
}) {}

export class Note extends Schema.Class<Note>("Note")({
  id: Schema.String,
  body: Schema.String,
  localDate: LocalDate,
  privacy: Privacy,
  shareToLive: Schema.Boolean,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}

export class NotesForDay extends Schema.Class<NotesForDay>("NotesForDay")({
  date: LocalDate,
  notes: Schema.Array(Note),
}) {}

export class NoteDay extends Schema.Class<NoteDay>("NoteDay")({
  date: LocalDate,
  notes: Schema.Array(Note),
}) {}

export class NotePage extends Schema.Class<NotePage>("NotePage")({
  days: Schema.Array(NoteDay),
  nextCursor: Schema.NullOr(Schema.String),
}) {}

export class FocusSession extends Schema.Class<FocusSession>("FocusSession")({
  id: Schema.String,
  label: Schema.NullOr(Schema.String),
  plannedMinutes: Schema.Number,
  status: SessionStatus,
  localDate: LocalDate,
  startedAt: Schema.Date,
  endsAt: Schema.NullOr(Schema.Date),
  endedAt: Schema.NullOr(Schema.Date),
  elapsedMs: Schema.Number,
  remainingMs: Schema.Number,
  privacy: Privacy,
  shareToLive: Schema.Boolean,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}

export class SessionsForDay extends Schema.Class<SessionsForDay>("SessionsForDay")({
  date: LocalDate,
  focusedMinutes: Schema.Number,
  sessions: Schema.Array(FocusSession),
}) {}

export class SessionDay extends Schema.Class<SessionDay>("SessionDay")({
  date: LocalDate,
  focusedMinutes: Schema.Number,
  sessions: Schema.Array(FocusSession),
}) {}

export class SessionPage extends Schema.Class<SessionPage>("SessionPage")({
  days: Schema.Array(SessionDay),
  nextCursor: Schema.NullOr(Schema.String),
}) {}

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

export class Person extends Schema.Class<Person>("Person")({
  username: Schema.String,
  name: Schema.String,
  image: Schema.NullOr(Schema.String),
}) {}

export class Connection extends Schema.Class<Connection>("Connection")({
  person: Person,
  since: Schema.Date,
}) {}

export class ConnectionRequest extends Schema.Class<ConnectionRequest>("ConnectionRequest")({
  id: Schema.String,
  person: Person,
  createdAt: Schema.Date,
}) {}

export class BlockedPerson extends Schema.Class<BlockedPerson>("BlockedPerson")({
  person: Person,
  since: Schema.Date,
}) {}

export class SocialStatus extends Schema.Class<SocialStatus>("SocialStatus")({
  state: ConnectionState,
  requestId: Schema.NullOr(Schema.String),
}) {}

export class PersonResult extends Schema.Class<PersonResult>("PersonResult")({
  person: Person,
  status: SocialStatus,
}) {}

export class ProfileCounts extends Schema.Class<ProfileCounts>("ProfileCounts")({
  connections: Schema.Number,
  points: Schema.Number,
  tasksSettled: Schema.Number,
  habitsCompleted: Schema.Number,
  goalsCompleted: Schema.Number,
  sessionsCompleted: Schema.Number,
}) {}

export class Profile extends Schema.Class<Profile>("Profile")({
  person: Person,
  joinedAt: Schema.Date,
  color: Schema.NullOr(UserColor),
  status: SocialStatus,
  counts: Schema.NullOr(ProfileCounts),
  askEnabled: Schema.Boolean,
}) {}

export class ProfileItem extends Schema.Class<ProfileItem>("ProfileItem")({
  id: Schema.String,
  kind: ActivityKind,
  title: Schema.NullOr(Schema.String),
  localDate: LocalDate,
  occurredAt: Schema.Date,
  privacy: Privacy,
  plannedMinutes: Schema.NullOr(Schema.Number),
}) {}

export class ProfileItemPage extends Schema.Class<ProfileItemPage>("ProfileItemPage")({
  items: Schema.Array(ProfileItem),
  nextCursor: Schema.NullOr(Schema.String),
}) {}

export class LeaderboardEntry extends Schema.Class<LeaderboardEntry>("LeaderboardEntry")({
  rank: Schema.Number,
  person: Person,
  points: Schema.Number,
}) {}

export class Leaderboard extends Schema.Class<Leaderboard>("Leaderboard")({
  entries: Schema.Array(LeaderboardEntry),
  me: Schema.NullOr(LeaderboardEntry),
  from: Schema.NullOr(LocalDate),
}) {}

export class LiveActor extends Schema.Class<LiveActor>("LiveActor")({
  username: Schema.String,
  name: Schema.String,
  image: Schema.NullOr(Schema.String),
  color: Schema.NullOr(UserColor),
}) {}

export class LiveEventMeta extends Schema.Class<LiveEventMeta>("LiveEventMeta")({
  percent: Schema.NullOr(Schema.Number),
  rose: Schema.NullOr(Schema.Boolean),
  minutes: Schema.NullOr(Schema.Number),
  count: Schema.NullOr(Schema.Number),
}) {}

export class LiveEvent extends Schema.Class<LiveEvent>("LiveEvent")({
  id: Schema.String,
  actor: LiveActor,
  mine: Schema.Boolean,
  kind: ActivityKind,
  occurredAt: Schema.Date,
  display: LiveDisplay,
  title: Schema.NullOr(Schema.String),
  meta: LiveEventMeta,
}) {}

export class LivePage extends Schema.Class<LivePage>("LivePage")({
  events: Schema.Array(LiveEvent),
  nextCursor: Schema.NullOr(Schema.String),
  hasConnections: Schema.Boolean,
}) {}

export class DiaryEntry extends Schema.Class<DiaryEntry>("DiaryEntry")({
  id: Schema.String,
  kind: ActivityKind,
  title: Schema.NullOr(Schema.String),
  occurredAt: Schema.Date,
  privacy: Privacy,
  meta: LiveEventMeta,
}) {}

export class DiaryDay extends Schema.Class<DiaryDay>("DiaryDay")({
  date: LocalDate,
  entries: Schema.Array(DiaryEntry),
}) {}

export class DiaryPage extends Schema.Class<DiaryPage>("DiaryPage")({
  days: Schema.Array(DiaryDay),
  nextCursor: Schema.NullOr(LocalDate),
}) {}

export class ContributionDay extends Schema.Class<ContributionDay>("ContributionDay")({
  date: LocalDate,
  count: Schema.Number,
}) {}

export class ContributionGraph extends Schema.Class<ContributionGraph>("ContributionGraph")({
  from: LocalDate,
  to: LocalDate,
  today: LocalDate,
  days: Schema.Array(ContributionDay),
  total: Schema.Number,
}) {}

export class PathEventMeta extends Schema.Class<PathEventMeta>("PathEventMeta")({
  percent: Schema.NullOr(Schema.Number),
  rose: Schema.NullOr(Schema.Boolean),
  minutes: Schema.NullOr(Schema.Number),
  count: Schema.NullOr(Schema.Number),
}) {}

export class PathEvent extends Schema.Class<PathEvent>("PathEvent")({
  id: Schema.String,
  kind: PathKind,
  occurredAt: Schema.Date,
  title: Schema.NullOr(Schema.String),
  meta: PathEventMeta,
}) {}

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

export * from "./notification-constants.ts";
export const NotificationKind = Schema.Literals(NOTIFICATION_KIND);
export type NotificationKind = typeof NotificationKind.Type;

export const NotificationState = Schema.Literals(["pending", "accepted", "declined"]);
export type NotificationState = typeof NotificationState.Type;

export class NotificationItem extends Schema.Class<NotificationItem>("NotificationItem")({
  id: Schema.String,
  kind: NotificationKind,
  person: Person,
  requestId: Schema.String,
  state: NotificationState,
  seen: Schema.Boolean,
  createdAt: Schema.Date,
}) {}

export class NotificationsUnseen extends Schema.Class<NotificationsUnseen>("NotificationsUnseen")({
  count: Schema.Number,
}) {}

export class AiUsage extends Schema.Class<AiUsage>("AiUsage")({
  used: Schema.Number,
  limit: Schema.Number,
  remaining: Schema.Number,
  period: Schema.String,
  resetsAt: Schema.Date,
}) {}

export * from "./ask-constants.ts";

export const AskSettingsPatch = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  instructions: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(ASK_INSTRUCTIONS_MAX_LENGTH))),
  sharedContext: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(ASK_SHARED_CONTEXT_MAX_LENGTH))),
  monthlyAnswerCap: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: ASK_MONTHLY_ANSWER_CAP_MAX })),
  ),
});
export type AskSettingsPatch = typeof AskSettingsPatch.Type;

export class AskDocument extends Schema.Class<AskDocument>("AskDocument")({
  id: Schema.String,
  name: Schema.String,
  text: Schema.String,
  createdAt: Schema.Date,
}) {}

export const AddAskDocumentInput = Schema.Struct({
  name: Schema.String.check(Schema.isTrimmed(), Schema.isBetweenLength(1, ASK_DOCUMENT_NAME_MAX_LENGTH)),
  text: Schema.String.check(Schema.isBetweenLength(1, ASK_DOCUMENT_MAX_LENGTH)),
});
export type AddAskDocumentInput = typeof AddAskDocumentInput.Type;

export const AskDocumentRef = Schema.Struct({ id: Id });
export type AskDocumentRef = typeof AskDocumentRef.Type;

export class AskSettings extends Schema.Class<AskSettings>("AskSettings")({
  enabled: Schema.Boolean,
  instructions: Schema.String,
  sharedContext: Schema.String,
  monthlyAnswerCap: Schema.Number,
  poolUsed: Schema.Number,
  resetsAt: Schema.Date,
  documents: Schema.Array(AskDocument),
}) {}

export class AskQuestion extends Schema.Class<AskQuestion>("AskQuestion")({
  id: Schema.String,
  question: Schema.String,
  answer: Schema.String,
  asker: Schema.NullOr(Person),
  createdAt: Schema.Date,
}) {}

export class AskPage extends Schema.Class<AskPage>("AskPage")({
  person: Person,
  color: Schema.NullOr(UserColor),
  available: Schema.Boolean,
  enabled: Schema.Boolean,
  self: Schema.Boolean,
}) {}

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

export class CheckInNotAllowed extends Schema.TaggedError<CheckInNotAllowed>()("CheckInNotAllowed", {
  message: Schema.String,
  reason: Schema.Literals(CHECK_IN_REFUSAL),
}) {}

export class NoteNotFound extends Schema.TaggedError<NoteNotFound>()("NoteNotFound", {
  message: Schema.String,
  id: Schema.String,
}) {}

export class NoteLimitReached extends Schema.TaggedError<NoteLimitReached>()("NoteLimitReached", {
  message: Schema.String,
  limit: Schema.Number,
}) {}

export class SessionNotFound extends Schema.TaggedError<SessionNotFound>()("SessionNotFound", {
  message: Schema.String,
  id: Schema.String,
}) {}

export class ActiveSessionExists extends Schema.TaggedError<ActiveSessionExists>()(
  "ActiveSessionExists",
  {
    message: Schema.String,
    session: FocusSession,
  },
) {}

export class AskDocumentLimit extends Schema.TaggedError<AskDocumentLimit>()("AskDocumentLimit", {
  message: Schema.String,
}) {}

export class AskDocumentNotFound extends Schema.TaggedError<AskDocumentNotFound>()("AskDocumentNotFound", {
  message: Schema.String,
}) {}

export class UserNotFound extends Schema.TaggedError<UserNotFound>()("UserNotFound", {
  message: Schema.String,
  username: Schema.String,
}) {}

export class ConnectionRequestNotFound extends Schema.TaggedError<ConnectionRequestNotFound>()(
  "ConnectionRequestNotFound",
  { message: Schema.String, id: Schema.String },
) {}

export const CONNECTION_REFUSAL = ["self", "already_connected", "blocked"] as const;
export type ConnectionRefusal = (typeof CONNECTION_REFUSAL)[number];

export class ConnectionNotAllowed extends Schema.TaggedError<ConnectionNotAllowed>()(
  "ConnectionNotAllowed",
  { message: Schema.String, reason: Schema.Literals(CONNECTION_REFUSAL) },
) {}

export class SocialLimitReached extends Schema.TaggedError<SocialLimitReached>()(
  "SocialLimitReached",
  { message: Schema.String },
) {}

export const RelayText = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isBetweenLength(1, RELAY_MESSAGE_MAX_LENGTH),
);

export const RelayRecipient = Schema.String.check(Schema.isBetweenLength(1, 100));

export const SendRelayInput = Schema.Struct({ toUsername: UsernameInput, message: RelayText });
export type SendRelayInput = typeof SendRelayInput.Type;

export const RELAY_REFUSAL = ["self", "blocked", "policy_none", "connections_only", "out_of_messages", "unavailable"] as const;
export type RelayRefusal = (typeof RELAY_REFUSAL)[number];

export class RelayNotAllowed extends Schema.TaggedError<RelayNotAllowed>()("RelayNotAllowed", {
  message: Schema.String,
  reason: Schema.Literals(RELAY_REFUSAL),
}) {}

export class RelayLimitReached extends Schema.TaggedError<RelayLimitReached>()("RelayLimitReached", {
  message: Schema.String,
}) {}

export class RelayRecipientUnclear extends Schema.TaggedError<RelayRecipientUnclear>()("RelayRecipientUnclear", {
  message: Schema.String,
  candidates: Schema.Array(Schema.Struct({ username: Schema.String, name: Schema.String })),
}) {}

export class RelayNotFound extends Schema.TaggedError<RelayNotFound>()("RelayNotFound", {
  message: Schema.String,
  id: Schema.String,
}) {}

export class RelayClosed extends Schema.TaggedError<RelayClosed>()("RelayClosed", {
  message: Schema.String,
  status: RelayStatus,
}) {}

export class SessionTransitionNotAllowed extends Schema.TaggedError<SessionTransitionNotAllowed>()(
  "SessionTransitionNotAllowed",
  {
    message: Schema.String,
    status: SessionStatus,
  },
) {}

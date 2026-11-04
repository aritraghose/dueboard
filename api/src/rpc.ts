import * as Context from "effect/Context";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";
import * as RpcMiddleware from "effect/rpc/RpcMiddleware";
import * as Schema from "effect/Schema";
import { LocalDate } from "./domain/dates.ts";
import {
  ActiveSessionExists,
  AiUsage,
  AddAskDocumentInput,
  AskDocumentLimit,
  AskDocumentNotFound,
  AskDocumentRef,
  AskPage,
  AskQuestion,
  AskSettings,
  AskSettingsPatch,
  AdjustGoalProgressInput,
  CheckInNotAllowed,
  ConnectionNotAllowed,
  ConnectionRequestNotFound,
  ConnectionRequestRef,
  ContributionGraph,
  CreateGoalInput,
  CreateHabitInput,
  CreateNoteInput,
  CreateTagInput,
  CreateTaskInput,
  Day,
  DeleteAccountInput,
  DiaryPage,
  GetContributionGraphInput,
  GetDiaryInput,
  GetLeaderboardInput,
  GetLiveInput,
  GetProfileItemsInput,
  Leaderboard,
  LivePage,
  Path,
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
  PersonResult,
  Profile,
  ProfileItemPage,
  SearchPeopleInput,
  SocialLimitReached,
  NotificationItem,
  NotificationsUnseen,
  SocialOverview,
  SocialStatus,
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
  UserNotFound,
  UsernameRef,
} from "./domain/model.ts";

export * from "./domain/model.ts";
export { documentText } from "./domain/ask-rules.ts";
export { LocalDate, addDays, localDateOf, startOfWeek, todayIn } from "./domain/dates.ts";
export { computeEndsAt, elapsed, remaining } from "./domain/session-rules.ts";
export { goalPercent, goalValue, isReached } from "./domain/goal-rules.ts";
export {
  dayStatus,
  describeSchedule,
  isScheduledOn,
  periodFor,
  progressFor,
  streak,
} from "./domain/habit-rules.ts";

export class CurrentUser extends Context.Service<
  CurrentUser,
  { readonly id: string; readonly username: string }
>()("api/CurrentUser") {}

export class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {
  message: Schema.String,
}) {}

export class TooManyRequests extends Schema.TaggedError<TooManyRequests>()("TooManyRequests", {
  message: Schema.String,
}) {}

export class Authentication extends RpcMiddleware.Service<
  Authentication,
  { provides: CurrentUser }
>()("api/Authentication", { error: Schema.Union([Unauthorized, TooManyRequests]) }) {}

export class Viewer extends Context.Service<
  Viewer,
  { readonly user: { readonly id: string; readonly username: string } | null }
>()("api/Viewer") {}

export class OptionalAuthentication extends RpcMiddleware.Service<
  OptionalAuthentication,
  { provides: Viewer }
>()("api/OptionalAuthentication", { error: TooManyRequests }) {}

export class PublicRpcs extends RpcGroup.make(
  Rpc.make("GetProfile", {
    payload: UsernameRef,
    success: Profile,
    error: Schema.Union([InvalidInput, UserNotFound]),
  }),
  Rpc.make("GetProfileItems", {
    payload: GetProfileItemsInput,
    success: ProfileItemPage,
    error: Schema.Union([InvalidInput, UserNotFound]),
  }),
  Rpc.make("GetDiary", {
    payload: GetDiaryInput,
    success: DiaryPage,
    error: Schema.Union([InvalidInput, UserNotFound]),
  }),
  Rpc.make("GetContributionGraph", {
    payload: GetContributionGraphInput,
    success: ContributionGraph,
    error: Schema.Union([InvalidInput, UserNotFound]),
  }),
  Rpc.make("GetAskPage", {
    payload: UsernameRef,
    success: AskPage,
    error: Schema.Union([InvalidInput, UserNotFound]),
  }),
).middleware(OptionalAuthentication) {}

export class BootstrapResult extends Schema.Class<BootstrapResult>("BootstrapResult")({
  settings: Settings,
  tags: Schema.Array(Tag),
}) {}

export class ApiRpcs extends RpcGroup.make(
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
  Rpc.make("DeleteTag", {
    payload: { id: Id },
    success: Schema.String,
    error: Schema.Union([TagNotFound, SystemTagLocked]),
  }),
  Rpc.make("CreateTask", {
    payload: CreateTaskInput,
    success: Task,
    error: Schema.Union([InvalidInput, TagNotFound]),
  }),
  Rpc.make("UpdateTask", {
    payload: UpdateTaskInput,
    success: Task,
    error: Schema.Union([InvalidInput, TaskNotFound, TagNotFound]),
  }),
  Rpc.make("SetTaskStatus", {
    payload: SetTaskStatusInput,
    success: Task,
    error: Schema.Union([InvalidInput, TaskNotFound]),
  }),
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
  Rpc.make("ListTasks", {
    payload: ListTasksInput,
    success: TaskPage,
    error: InvalidInput,
  }),
  Rpc.make("CreateHabit", {
    payload: CreateHabitInput,
    success: Habit,
    error: InvalidInput,
  }),
  Rpc.make("UpdateHabit", {
    payload: UpdateHabitInput,
    success: Habit,
    error: Schema.Union([InvalidInput, HabitNotFound]),
  }),
  Rpc.make("PauseHabit", {
    payload: { id: Id },
    success: Habit,
    error: Schema.Union([InvalidInput, HabitNotFound]),
  }),
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
  Rpc.make("DeleteHabit", {
    payload: { id: Id },
    success: Schema.String,
    error: Schema.Union([InvalidInput, HabitNotFound]),
  }),
  Rpc.make("CheckInHabit", {
    payload: HabitCheckInInput,
    success: HabitOnDay,
    error: Schema.Union([InvalidInput, HabitNotFound, CheckInNotAllowed]),
  }),
  Rpc.make("UndoCheckInHabit", {
    payload: HabitCheckInInput,
    success: HabitOnDay,
    error: Schema.Union([InvalidInput, HabitNotFound, CheckInNotAllowed]),
  }),
  Rpc.make("ListHabitsForDay", {
    payload: { date: LocalDate },
    success: HabitsForDay,
    error: InvalidInput,
  }),
  Rpc.make("ListHabits", {
    success: Schema.Array(HabitSummary),
  }),
  Rpc.make("GetHabit", {
    payload: { id: Id },
    success: HabitSummary,
    error: Schema.Union([InvalidInput, HabitNotFound]),
  }),
  Rpc.make("CreateGoal", {
    payload: CreateGoalInput,
    success: Goal,
    error: InvalidInput,
  }),
  Rpc.make("UpdateGoal", {
    payload: UpdateGoalInput,
    success: Goal,
    error: Schema.Union([InvalidInput, GoalNotFound]),
  }),
  Rpc.make("SetGoalProgress", {
    payload: SetGoalProgressInput,
    success: Goal,
    error: Schema.Union([InvalidInput, GoalNotFound]),
  }),
  Rpc.make("AdjustGoalProgress", {
    payload: AdjustGoalProgressInput,
    success: Goal,
    error: Schema.Union([InvalidInput, GoalNotFound]),
  }),
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
  Rpc.make("ReopenGoal", {
    payload: { id: Id },
    success: Goal,
    error: Schema.Union([InvalidInput, GoalNotFound]),
  }),
  Rpc.make("DeleteGoal", {
    payload: { id: Id },
    success: Schema.String,
    error: Schema.Union([InvalidInput, GoalNotFound]),
  }),
  Rpc.make("LinkGoalItem", {
    payload: LinkGoalItemInput,
    success: GoalLink,
    error: Schema.Union([InvalidInput, GoalNotFound, TaskNotFound, HabitNotFound]),
  }),
  Rpc.make("UnlinkGoalItem", {
    payload: UnlinkGoalItemInput,
    error: Schema.Union([InvalidInput, GoalNotFound]),
  }),
  Rpc.make("ListGoalsForDay", {
    payload: { date: LocalDate },
    success: GoalsForDay,
    error: InvalidInput,
  }),
  Rpc.make("ListGoals", {
    payload: ListGoalsInput,
    success: Schema.Array(GoalSummary),
    error: InvalidInput,
  }),
  Rpc.make("GetGoal", {
    payload: { id: Id },
    success: GoalSummary,
    error: Schema.Union([InvalidInput, GoalNotFound]),
  }),
  Rpc.make("ListItemGoals", {
    payload: GoalItemRef,
    success: Schema.Array(ItemGoal),
    error: InvalidInput,
  }),
  Rpc.make("CreateNote", {
    payload: CreateNoteInput,
    success: Note,
    error: Schema.Union([InvalidInput, NoteLimitReached]),
  }),
  Rpc.make("UpdateNote", {
    payload: UpdateNoteInput,
    success: Note,
    error: Schema.Union([InvalidInput, NoteNotFound]),
  }),
  Rpc.make("DeleteNote", {
    payload: { id: Id },
    success: Schema.String,
    error: Schema.Union([InvalidInput, NoteNotFound]),
  }),
  Rpc.make("ListNotesForDay", {
    payload: { date: LocalDate },
    success: NotesForDay,
    error: InvalidInput,
  }),
  Rpc.make("ListNotes", {
    payload: ListNotesInput,
    success: NotePage,
    error: InvalidInput,
  }),
  Rpc.make("StartSession", {
    payload: StartSessionInput,
    success: FocusSession,
    error: Schema.Union([InvalidInput, ActiveSessionExists]),
  }),
  Rpc.make("PauseSession", {
    payload: { id: Id },
    success: FocusSession,
    error: Schema.Union([InvalidInput, SessionNotFound, SessionTransitionNotAllowed]),
  }),
  Rpc.make("ResumeSession", {
    payload: { id: Id },
    success: FocusSession,
    error: Schema.Union([InvalidInput, SessionNotFound, SessionTransitionNotAllowed]),
  }),
  Rpc.make("ExtendSession", {
    payload: ExtendSessionInput,
    success: FocusSession,
    error: Schema.Union([InvalidInput, SessionNotFound, SessionTransitionNotAllowed]),
  }),
  Rpc.make("StopSession", {
    payload: { id: Id },
    success: FocusSession,
    error: Schema.Union([InvalidInput, SessionNotFound, SessionTransitionNotAllowed]),
  }),
  Rpc.make("GetActiveSession", {
    success: Schema.NullOr(FocusSession),
  }),
  Rpc.make("ListSessions", {
    payload: ListSessionsInput,
    success: SessionPage,
    error: InvalidInput,
  }),
  Rpc.make("ListSessionsForDay", {
    payload: { date: LocalDate },
    success: SessionsForDay,
    error: InvalidInput,
  }),
  Rpc.make("GetDay", {
    payload: { date: LocalDate },
    success: Day,
    error: InvalidInput,
  }),
  Rpc.make("GetUpcoming", {
    payload: GetUpcomingInput,
    success: Upcoming,
    error: InvalidInput,
  }),
  Rpc.make("DeleteSession", {
    payload: { id: Id },
    success: Schema.String,
    error: Schema.Union([InvalidInput, SessionNotFound]),
  }),
  Rpc.make("SendConnectionRequest", {
    payload: UsernameRef,
    success: SocialStatus,
    error: Schema.Union([InvalidInput, UserNotFound, ConnectionNotAllowed, SocialLimitReached]),
  }),
  Rpc.make("AcceptConnectionRequest", {
    payload: ConnectionRequestRef,
    success: SocialStatus,
    error: Schema.Union([InvalidInput, ConnectionRequestNotFound]),
  }),
  Rpc.make("DeclineConnectionRequest", {
    payload: ConnectionRequestRef,
    success: SocialStatus,
    error: Schema.Union([InvalidInput, ConnectionRequestNotFound]),
  }),
  Rpc.make("CancelConnectionRequest", {
    payload: ConnectionRequestRef,
    success: SocialStatus,
    error: Schema.Union([InvalidInput, ConnectionRequestNotFound]),
  }),
  Rpc.make("RemoveConnection", {
    payload: UsernameRef,
    success: SocialStatus,
    error: Schema.Union([InvalidInput, UserNotFound]),
  }),
  Rpc.make("BlockUser", {
    payload: UsernameRef,
    success: SocialStatus,
    error: Schema.Union([InvalidInput, UserNotFound, ConnectionNotAllowed]),
  }),
  Rpc.make("UnblockUser", {
    payload: UsernameRef,
    success: SocialStatus,
    error: Schema.Union([InvalidInput, UserNotFound]),
  }),
  Rpc.make("GetSocialOverview", {
    success: SocialOverview,
  }),
  Rpc.make("SearchPeople", {
    payload: SearchPeopleInput,
    success: Schema.Array(PersonResult),
    error: Schema.Union([InvalidInput, SocialLimitReached]),
  }),
  Rpc.make("ListNotifications", {
    success: Schema.Array(NotificationItem),
  }),
  Rpc.make("GetUnseenNotifications", {
    success: NotificationsUnseen,
  }),
  Rpc.make("MarkNotificationsSeen"),
  Rpc.make("DeleteAccount", {
    payload: DeleteAccountInput,
    error: InvalidInput,
  }),
  Rpc.make("GetLeaderboard", {
    payload: GetLeaderboardInput,
    success: Leaderboard,
    error: InvalidInput,
  }),
  Rpc.make("GetLive", {
    payload: GetLiveInput,
    success: LivePage,
    error: InvalidInput,
  }),
  Rpc.make("GetPath", {
    success: Path,
  }),
  Rpc.make("GetAiUsage", {
    success: AiUsage,
  }),
  Rpc.make("GetAskSettings", {
    success: AskSettings,
  }),
  Rpc.make("UpdateAskSettings", {
    payload: AskSettingsPatch,
    success: AskSettings,
    error: InvalidInput,
  }),
  Rpc.make("AddAskDocument", {
    payload: AddAskDocumentInput,
    success: AskSettings,
    error: Schema.Union([InvalidInput, AskDocumentLimit]),
  }),
  Rpc.make("DeleteAskDocument", {
    payload: AskDocumentRef,
    success: AskSettings,
    error: Schema.Union([InvalidInput, AskDocumentNotFound]),
  }),
  Rpc.make("ListAskQuestions", {
    success: Schema.Array(AskQuestion),
  }),
)
  .middleware(Authentication)
  .merge(PublicRpcs) {}

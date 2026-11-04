import * as Effect from "effect/Effect";
import * as AccountService from "./domain/account.ts";
import * as AskService from "./domain/ask.ts";
import * as DaysService from "./domain/days.ts";
import * as DiaryService from "./domain/diary.ts";
import * as GoalsService from "./domain/goals.ts";
import * as HabitsService from "./domain/habits.ts";
import * as LiveService from "./domain/live.ts";
import * as NotesService from "./domain/notes.ts";
import * as NotificationsService from "./domain/notifications.ts";
import * as PointsService from "./domain/points.ts";
import * as ProfileItemsService from "./domain/profile-items.ts";
import * as SessionsService from "./domain/sessions.ts";
import * as SettingsService from "./domain/settings.ts";
import * as SocialService from "./domain/social.ts";
import * as TagsService from "./domain/tags.ts";
import * as TasksService from "./domain/tasks.ts";
import * as UsageService from "./domain/usage.ts";
import { ApiRpcs, BootstrapResult, CurrentUser, Viewer } from "./rpc.ts";

/**
 * One handler per RPC in `ApiRpcs`, each running as `CurrentUser` (the
 * `PublicRpcs` ones as `Viewer`). Two Workers serve them: the ApiWorker
 * (`./api.ts`) for the browser, with the user from the cookie session, and
 * the DomainWorker (`./DomainWorker.ts`) for Tibo, as the agent's own user.
 *
 * Handlers stay thin: the rules live in the domain services (`./domain/`),
 * which take the acting user id explicitly, query through `Database`, and
 * turn database errors into defects, so each handler's error channel
 * matches its RPC schema.
 */
export const apiHandlers = ApiRpcs.of({
  Bootstrap: ({ timeZone }) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return new BootstrapResult(yield* SettingsService.bootstrap(user.id, timeZone));
    }),
  UpdateSettings: (patch) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* SettingsService.updateSettings(user.id, patch);
    }),
  ListTags: () =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* TagsService.listTags(user.id);
    }),
  CreateTag: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* TagsService.createTag(user.id, input);
    }),
  UpdateTag: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* TagsService.updateTag(user.id, input);
    }),
  DeleteTag: ({ id }) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* TagsService.deleteTag(user.id, id);
    }),
  CreateTask: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* TasksService.createTask(user.id, input);
    }),
  UpdateTask: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* TasksService.updateTask(user.id, input);
    }),
  SetTaskStatus: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* TasksService.setTaskStatus(user.id, input);
    }),
  DeleteTask: ({ id }) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* TasksService.deleteTask(user.id, id);
    }),
  GetTask: ({ id }) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* TasksService.getTask(user.id, id);
    }),
  ListTasksForDay: ({ date }) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* TasksService.listTasksForDay(user.id, date);
    }),
  ListUnscheduledTasks: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* TasksService.listUnscheduledTasks(user.id, input);
    }),
  ListTasks: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* TasksService.listTasks(user.id, input);
    }),
  CreateHabit: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* HabitsService.createHabit(user.id, input);
    }),
  UpdateHabit: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* HabitsService.updateHabit(user.id, input);
    }),
  PauseHabit: ({ id }) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* HabitsService.pauseHabit(user.id, id);
    }),
  ResumeHabit: ({ id }) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* HabitsService.resumeHabit(user.id, id);
    }),
  ArchiveHabit: ({ id }) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* HabitsService.archiveHabit(user.id, id);
    }),
  DeleteHabit: ({ id }) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* HabitsService.deleteHabit(user.id, id);
    }),
  CheckInHabit: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* HabitsService.checkIn(user.id, input);
    }),
  UndoCheckInHabit: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* HabitsService.undoCheckIn(user.id, input);
    }),
  ListHabitsForDay: ({ date }) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* HabitsService.listHabitsForDay(user.id, date);
    }),
  ListHabits: () =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* HabitsService.listHabits(user.id);
    }),
  GetHabit: ({ id }) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* HabitsService.getHabit(user.id, id);
    }),
  CreateGoal: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* GoalsService.createGoal(user.id, input);
    }),
  UpdateGoal: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* GoalsService.updateGoal(user.id, input);
    }),
  SetGoalProgress: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* GoalsService.setProgress(user.id, input);
    }),
  AdjustGoalProgress: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* GoalsService.adjustProgress(user.id, input);
    }),
  PauseGoal: ({ id }) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* GoalsService.pauseGoal(user.id, id);
    }),
  ResumeGoal: ({ id }) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* GoalsService.resumeGoal(user.id, id);
    }),
  ReopenGoal: ({ id }) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* GoalsService.reopenGoal(user.id, id);
    }),
  DeleteGoal: ({ id }) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* GoalsService.deleteGoal(user.id, id);
    }),
  LinkGoalItem: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* GoalsService.linkItem(user.id, input);
    }),
  UnlinkGoalItem: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* GoalsService.unlinkItem(user.id, input);
    }),
  ListGoalsForDay: ({ date }) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* GoalsService.listGoalsForDay(user.id, date);
    }),
  ListGoals: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* GoalsService.listGoals(user.id, input);
    }),
  GetGoal: ({ id }) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* GoalsService.getGoal(user.id, id);
    }),
  ListItemGoals: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* GoalsService.listItemGoals(user.id, input);
    }),
  CreateNote: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* NotesService.createNote(user.id, input);
    }),
  UpdateNote: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* NotesService.updateNote(user.id, input);
    }),
  DeleteNote: ({ id }) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* NotesService.deleteNote(user.id, id);
    }),
  ListNotesForDay: ({ date }) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* NotesService.listNotesForDay(user.id, date);
    }),
  ListNotes: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* NotesService.listNotes(user.id, input);
    }),
  StartSession: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* SessionsService.startSession(user.id, input);
    }),
  PauseSession: ({ id }) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* SessionsService.pauseSession(user.id, id);
    }),
  ResumeSession: ({ id }) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* SessionsService.resumeSession(user.id, id);
    }),
  ExtendSession: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* SessionsService.extendSession(user.id, input);
    }),
  StopSession: ({ id }) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* SessionsService.stopSession(user.id, id);
    }),
  GetActiveSession: () =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* SessionsService.getActiveSession(user.id);
    }),
  ListSessions: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* SessionsService.listSessions(user.id, input);
    }),
  ListSessionsForDay: ({ date }) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* SessionsService.listSessionsForDay(user.id, date);
    }),
  GetDay: ({ date }) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* DaysService.getDay(user.id, date);
    }),
  GetUpcoming: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* DaysService.getUpcoming(user.id, input);
    }),
  DeleteSession: ({ id }) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* SessionsService.deleteSession(user.id, id);
    }),
  SendConnectionRequest: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* SocialService.sendConnectionRequest(user.id, input);
    }),
  AcceptConnectionRequest: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* SocialService.acceptConnectionRequest(user.id, input);
    }),
  DeclineConnectionRequest: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* SocialService.declineConnectionRequest(user.id, input);
    }),
  CancelConnectionRequest: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* SocialService.cancelConnectionRequest(user.id, input);
    }),
  RemoveConnection: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* SocialService.removeConnection(user.id, input);
    }),
  BlockUser: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* SocialService.blockUser(user.id, input);
    }),
  UnblockUser: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* SocialService.unblockUser(user.id, input);
    }),
  GetSocialOverview: () =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* SocialService.getSocialOverview(user.id);
    }),
  SearchPeople: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* SocialService.searchPeople(user.id, input);
    }),
  ListNotifications: () =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* NotificationsService.listNotifications(user.id);
    }),
  GetUnseenNotifications: () =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* NotificationsService.countUnseenNotifications(user.id);
    }),
  MarkNotificationsSeen: () =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* NotificationsService.markNotificationsSeen(user.id);
    }),
  DeleteAccount: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* AccountService.deleteAccount(user.id, user.username, input);
    }),
  GetProfile: (input) =>
    Effect.gen(function* () {
      const { user } = yield* Viewer;
      return yield* SocialService.getProfile(user?.id ?? null, input);
    }),
  GetProfileItems: (input) =>
    Effect.gen(function* () {
      const { user } = yield* Viewer;
      return yield* ProfileItemsService.getProfileItems(user?.id ?? null, input);
    }),
  GetDiary: (input) =>
    Effect.gen(function* () {
      const { user } = yield* Viewer;
      return yield* DiaryService.getDiary(user?.id ?? null, input);
    }),
  GetContributionGraph: (input) =>
    Effect.gen(function* () {
      const { user } = yield* Viewer;
      return yield* DiaryService.getContributionGraph(user?.id ?? null, input);
    }),
  GetLeaderboard: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* PointsService.getLeaderboard(user.id, input);
    }),
  GetLive: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* LiveService.getLive(user.id, input);
    }),
  GetPath: () =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* LiveService.getPath(user.id);
    }),
  GetAiUsage: () =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* UsageService.getUsage(user.id);
    }),
  GetAskSettings: () =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* AskService.getAskSettings(user.id);
    }),
  UpdateAskSettings: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* AskService.updateAskSettings(user.id, input);
    }),
  AddAskDocument: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* AskService.addAskDocument(user.id, input);
    }),
  DeleteAskDocument: (input) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* AskService.deleteAskDocument(user.id, input);
    }),
  ListAskQuestions: () =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      return yield* AskService.listAskQuestions(user.id);
    }),
  GetAskPage: (input) =>
    Effect.gen(function* () {
      const { user } = yield* Viewer;
      return yield* AskService.getAskPage(user?.id ?? null, input);
    }),
});

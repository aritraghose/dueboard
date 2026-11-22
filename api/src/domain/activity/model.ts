import * as Schema from "effect/Schema";
import { LocalDate } from "../core/dates.ts";
import { Privacy } from "../core/model.ts";
import { Person, UsernameInput } from "../social/model.ts";
import { UserColor } from "../tags/model.ts";

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

export const PROFILE_FEED = ["tasks", "habits", "goals", "sessions"] as const;
export const ProfileFeed = Schema.Literals(PROFILE_FEED);
export type ProfileFeed = typeof ProfileFeed.Type;

export const LEADERBOARD_SCOPE = ["connections", "public"] as const;
export const LeaderboardScope = Schema.Literals(LEADERBOARD_SCOPE);
export type LeaderboardScope = typeof LeaderboardScope.Type;

export const LEADERBOARD_PERIOD = ["all", "month", "week", "today"] as const;
export const LeaderboardPeriod = Schema.Literals(LEADERBOARD_PERIOD);
export type LeaderboardPeriod = typeof LeaderboardPeriod.Type;
export const PROFILE_ITEMS_PAGE_SIZE = 30;
export const PROFILE_ITEMS_CURSOR_MAX_LENGTH = 128;
export const LEADERBOARD_SIZE = 50;
export const LIVE_PAGE_SIZE = 30;
export const LIVE_MAX_DAYS = 7;

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

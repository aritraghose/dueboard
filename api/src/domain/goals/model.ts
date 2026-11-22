import * as Schema from "effect/Schema";
import { LocalDate } from "../core/dates.ts";
import { Id, Privacy } from "../core/model.ts";

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

export const GOAL_NAME_MAX_LENGTH = 200;
export const GOAL_DESCRIPTION_MAX_LENGTH = 2000;
export const GOAL_COUNT_MAX = 1_000_000;
export const GOAL_LINK_AMOUNT_MAX = 1000;
export const GOAL_LINKS_MAX = 50;
export const GOAL_EVENTS_IN_LIST = 10;
export const GOAL_EVENTS_IN_DETAIL = 50;

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

export class GoalNotFound extends Schema.TaggedError<GoalNotFound>()("GoalNotFound", {
  message: Schema.String,
  id: Schema.String,
}) {}

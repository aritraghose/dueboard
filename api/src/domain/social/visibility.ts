import { and, eq, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import * as Effect from "effect/Effect";
import { Activity, Blocks, Connections, FocusSessions, Goals, Habits, Notes, Tasks } from "../schema.ts";
import type { LiveScope, Privacy } from "./model.ts";
import { areConnected, isBlocked } from "./social.ts";
import { relationOf, visiblePrivacies, type ViewerRelation } from "./visibility-rules.ts";

export {
  canSeeItem,
  canSeeOnLive,
  liveDisplay,
  relationOf,
  visiblePrivacies,
  type LiveDisplay,
  type Relationship,
  type ViewerRelation,
} from "./visibility-rules.ts";

export const viewerRelation = Effect.fn("viewerRelation")(function* (
  viewerId: string | null,
  ownerId: string,
) {
  if (viewerId === null || viewerId === ownerId) return relationOf(viewerId, ownerId, { connected: false, blocked: false });
  const blocked = yield* isBlocked(viewerId, ownerId);
  const connected = !blocked && (yield* areConnected(viewerId, ownerId));
  return relationOf(viewerId, ownerId, { connected, blocked }) as ViewerRelation;
});

type OwnerColumn = PgColumn | SQL;

export const connectionIdsOf = (viewerId: string): SQL =>
  sql`select case when ${Connections.userLow} = ${viewerId} then ${Connections.userHigh} else ${Connections.userLow} end
      from ${Connections}
      where ${Connections.userLow} = ${viewerId} or ${Connections.userHigh} = ${viewerId}`;

export const connectedSql = (viewerId: string, owner: OwnerColumn): SQL =>
  sql`${owner} in (${connectionIdsOf(viewerId)})`;

export const notBlockedSql = (viewerId: string, owner: OwnerColumn): SQL =>
  sql`not exists (
    select 1 from ${Blocks}
    where (${Blocks.blockerId} = ${viewerId} and ${Blocks.blockedId} = ${owner})
       or (${Blocks.blockerId} = ${owner} and ${Blocks.blockedId} = ${viewerId}))`;

export const canSeeItemSql = (viewerId: string | null, owner: OwnerColumn, privacy: SQL | PgColumn): SQL => {
  if (viewerId === null) return sql`${privacy} = 'public'`;
  return sql`(${owner} = ${viewerId} or (${notBlockedSql(viewerId, owner)} and (
    ${privacy} = 'public' or (${privacy} = 'connections' and ${connectedSql(viewerId, owner)}))))`;
};

export const privacyVisibleSql = (relation: ViewerRelation, privacy: SQL): SQL => {
  const privacies = visiblePrivacies(relation);
  return privacies.length === 0 ? sql`false` : inArray(privacy, [...privacies]);
};

export const liveActorSql = (viewerId: string, owner: OwnerColumn, scope: LiveScope): SQL => {
  const connections = sql`(${connectedSql(viewerId, owner)} and ${notBlockedSql(viewerId, owner)})`;
  switch (scope) {
    case "mine":
      return sql`${owner} = ${viewerId}`;
    case "connections":
      return connections;
    case "all":
      return sql`(${owner} = ${viewerId} or ${connections})`;
  }
};

export const activitySubjectJoin = {
  task: and(eq(Activity.subjectType, "task"), eq(Tasks.id, Activity.subjectId))!,
  habit: and(eq(Activity.subjectType, "habit"), eq(Habits.id, Activity.subjectId))!,
  goal: and(eq(Activity.subjectType, "goal"), eq(Goals.id, Activity.subjectId))!,
  session: and(eq(Activity.subjectType, "session"), eq(FocusSessions.id, Activity.subjectId))!,
  note: and(eq(Activity.subjectType, "note"), eq(Notes.id, Activity.subjectId))!,
} as const;

export const activitySubjectPrivacy = sql<Privacy | null>`coalesce(${Tasks.privacy}, ${Habits.privacy}, ${Goals.privacy}, ${FocusSessions.privacy}, ${Notes.privacy})`;

export const activitySubjectShareToLive = sql<boolean | null>`coalesce(${Tasks.shareToLive}, ${Habits.shareToLive}, ${Goals.shareToLive}, ${FocusSessions.shareToLive}, ${Notes.shareToLive})`;

export const activitySubjectTitle = sql<string | null>`coalesce(${Tasks.title}, ${Habits.title}, ${Goals.name}, ${FocusSessions.label}, ${Notes.body})`;

export const activitySubjectExists = isNotNull(activitySubjectPrivacy);

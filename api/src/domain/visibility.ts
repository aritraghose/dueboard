import { and, eq, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import * as Effect from "effect/Effect";
import { Activity, Blocks, Connections, FocusSessions, Goals, Habits, Notes, Tasks } from "../schema.ts";
import type { LiveScope, Privacy } from "./model.ts";
import { areConnected, isBlocked } from "./social.ts";
import { relationOf, visiblePrivacies, type ViewerRelation } from "./visibility-rules.ts";

// The one place readers of other users' data learn what a viewer may see
// (planning.md working rule 9). The rules themselves are pure, in
// `visibility-rules.ts`; this module looks the relationship up for one
// owner, and builds the same rules as SQL conditions so readers filter in
// the database (pages stay full and nothing hidden is ever loaded).

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

/** How `viewerId` (or a logged-out visitor, `null`) relates to `ownerId`. */
export const viewerRelation = Effect.fn("viewerRelation")(function* (
  viewerId: string | null,
  ownerId: string,
) {
  if (viewerId === null || viewerId === ownerId) return relationOf(viewerId, ownerId, { connected: false, blocked: false });
  const blocked = yield* isBlocked(viewerId, ownerId);
  const connected = !blocked && (yield* areConnected(viewerId, ownerId));
  return relationOf(viewerId, ownerId, { connected, blocked }) as ViewerRelation;
});

// ─── SQL conditions ──────────────────────────────────────────────────────────

type OwnerColumn = PgColumn | SQL;

/** Ids of `viewerId`'s connections, as a subquery. */
export const connectionIdsOf = (viewerId: string): SQL =>
  sql`select case when ${Connections.userLow} = ${viewerId} then ${Connections.userHigh} else ${Connections.userLow} end
      from ${Connections}
      where ${Connections.userLow} = ${viewerId} or ${Connections.userHigh} = ${viewerId}`;

/** `owner` and `viewerId` are connected. */
export const connectedSql = (viewerId: string, owner: OwnerColumn): SQL =>
  sql`${owner} in (${connectionIdsOf(viewerId)})`;

/** Neither `owner` nor `viewerId` blocked the other. */
export const notBlockedSql = (viewerId: string, owner: OwnerColumn): SQL =>
  sql`not exists (
    select 1 from ${Blocks}
    where (${Blocks.blockerId} = ${viewerId} and ${Blocks.blockedId} = ${owner})
       or (${Blocks.blockerId} = ${owner} and ${Blocks.blockedId} = ${viewerId}))`;

/**
 * `canSeeItem` as a condition on rows of many owners: the owner's own,
 * public items unless blocked, connections-only items of connections.
 */
export const canSeeItemSql = (viewerId: string | null, owner: OwnerColumn, privacy: SQL | PgColumn): SQL => {
  if (viewerId === null) return sql`${privacy} = 'public'`;
  return sql`(${owner} = ${viewerId} or (${notBlockedSql(viewerId, owner)} and (
    ${privacy} = 'public' or (${privacy} = 'connections' and ${connectedSql(viewerId, owner)}))))`;
};

/** `canSeeItem` for one owner whose relation is already known (a profile). */
export const privacyVisibleSql = (relation: ViewerRelation, privacy: SQL): SQL => {
  const privacies = visiblePrivacies(relation);
  return privacies.length === 0 ? sql`false` : inArray(privacy, [...privacies]);
};

/**
 * Whose events reach `viewerId`'s Live (`canSeeOnLive`, before the share
 * flag): their own, and their connections' unless blocked. `scope` narrows
 * it to the connections or to the viewer.
 */
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

// ─── Activity subjects ───────────────────────────────────────────────────────

// An activity row never copies its item's title, privacy or share flag
// (architecture.md §5): readers left-join every subject table with these
// conditions and read the item's current values, so a privacy change applies
// at once. A row whose item is gone has no subject and must never show
// (`activitySubjectExists`).

export const activitySubjectJoin = {
  task: and(eq(Activity.subjectType, "task"), eq(Tasks.id, Activity.subjectId))!,
  habit: and(eq(Activity.subjectType, "habit"), eq(Habits.id, Activity.subjectId))!,
  goal: and(eq(Activity.subjectType, "goal"), eq(Goals.id, Activity.subjectId))!,
  session: and(eq(Activity.subjectType, "session"), eq(FocusSessions.id, Activity.subjectId))!,
  note: and(eq(Activity.subjectType, "note"), eq(Notes.id, Activity.subjectId))!,
} as const;

/** The subject's current privacy (`null` when the item is gone). */
export const activitySubjectPrivacy = sql<Privacy | null>`coalesce(${Tasks.privacy}, ${Habits.privacy}, ${Goals.privacy}, ${FocusSessions.privacy}, ${Notes.privacy})`;

/** The subject's current share-to-Live flag. */
export const activitySubjectShareToLive = sql<boolean | null>`coalesce(${Tasks.shareToLive}, ${Habits.shareToLive}, ${Goals.shareToLive}, ${FocusSessions.shareToLive}, ${Notes.shareToLive})`;

/** The task's or habit's title, the goal's name, the session's label (may be `null`) or the note's body. */
export const activitySubjectTitle = sql<string | null>`coalesce(${Tasks.title}, ${Habits.title}, ${Goals.name}, ${FocusSessions.label}, ${Notes.body})`;

/** The activity row's item still exists. Deleting an item deletes its rows too; this makes sure. */
export const activitySubjectExists = isNotNull(activitySubjectPrivacy);

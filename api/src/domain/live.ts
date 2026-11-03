import { and, desc, eq, gt, gte, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import * as Effect from "effect/Effect";
import {
  Activity,
  Connections,
  FocusSessionSegments,
  FocusSessions,
  Goals,
  HabitCheckins,
  Habits,
  Notes,
  Tasks,
  UserSettings,
} from "../schema.ts";
import { AuthUsers } from "./auth-users.ts";
import { Database, orDieOnDbError } from "./database.ts";
import { FALLBACK_TIME_ZONE, addDays, todayIn } from "./dates.ts";
import {
  GetLiveInput,
  InvalidInput,
  LIVE_PAGE_SIZE,
  LiveActor,
  LiveEvent,
  LiveEventMeta,
  LivePage,
  Path,
  PathEvent,
  PathEventMeta,
  decodeInput,
  type UserColor,
} from "./model.ts";
import { decodeItemCursor, encodeItemCursor } from "./profile-rules.ts";
import {
  activitySubjectExists,
  activitySubjectJoin,
  activitySubjectPrivacy,
  activitySubjectShareToLive,
  activitySubjectTitle,
  liveActorSql,
  liveDisplay,
} from "./visibility.ts";

// Live (architecture.md §5): what the viewer and their connections did over
// the last few days, newest first. Computed when read: activity rows of the
// actor set (`liveActorSql`) joined to their items, so the item's current
// privacy and share flag decide what shows, and deleted items never do.
// The Path is the viewer's own today, oldest first: only ever their own
// items, so it needs no visibility filter and ignores the share flag.

/** Whole minutes focused in a stopped session, from its segments. */
export const focusedMinutes = sql<number | null>`(
  select round(sum(extract(epoch from coalesce(${FocusSessionSegments.endedAt}, now()) - ${FocusSessionSegments.startedAt})) / 60)::int
  from ${FocusSessionSegments} where ${FocusSessionSegments.sessionId} = ${FocusSessions.id})`;

/**
 * A habit's `habit_checked` row stays off Live on a day its `habit_completed`
 * row covers too: "completed a habit" already says it, and a one-tap habit
 * would otherwise show twice.
 */
const notCoveredCheck = sql`(${Activity.kind} <> 'habit_checked' or not exists (
  select 1 from ${Activity} c
  where c.kind = 'habit_completed' and c.subject_type = 'habit'
    and c.subject_id = ${Activity.subjectId} and c.local_date = ${Activity.localDate}))`;

/** One page of `viewerId`'s Live. */
export const getLive = Effect.fn("getLive")(function* (viewerId: string, input: GetLiveInput) {
  const { days, scope, cursor } = yield* decodeInput(GetLiveInput)(input);
  const after = cursor === undefined ? undefined : decodeItemCursor(cursor);
  if (after === null) return yield* new InvalidInput({ message: "That page link is no longer valid." });
  const db = yield* Database;
  const [settings] = yield* db
    .select({ timeZone: UserSettings.timeZone })
    .from(UserSettings)
    .where(eq(UserSettings.userId, viewerId))
    .pipe(orDieOnDbError);
  const timeZone = settings?.timeZone ?? FALLBACK_TIME_ZONE;
  // Midnight of the window's first day in the viewer's zone.
  const from = addDays(todayIn(timeZone), -(days - 1));
  const since = sql<Date>`(${from}::date)::timestamp at time zone ${timeZone}`;

  const rows = yield* db
    .select({
      id: Activity.id,
      userId: Activity.userId,
      kind: Activity.kind,
      occurredAt: Activity.occurredAt,
      meta: Activity.meta,
      title: activitySubjectTitle,
      privacy: activitySubjectPrivacy,
      plannedMinutes: FocusSessions.plannedMinutes,
      focusedMinutes,
      username: AuthUsers.username,
      name: AuthUsers.name,
      image: AuthUsers.image,
      color: UserSettings.color,
    })
    .from(Activity)
    .innerJoin(AuthUsers, and(eq(AuthUsers.id, Activity.userId), isNotNull(AuthUsers.username)))
    .leftJoin(UserSettings, eq(UserSettings.userId, Activity.userId))
    .leftJoin(Tasks, activitySubjectJoin.task)
    .leftJoin(Habits, activitySubjectJoin.habit)
    .leftJoin(Goals, activitySubjectJoin.goal)
    .leftJoin(FocusSessions, activitySubjectJoin.session)
    .leftJoin(Notes, activitySubjectJoin.note)
    .where(
      and(
        liveActorSql(viewerId, Activity.userId, scope),
        activitySubjectExists,
        eq(activitySubjectShareToLive, true),
        gte(Activity.occurredAt, since),
        notCoveredCheck,
        after
          ? or(
              lt(Activity.occurredAt, after.occurredAt),
              and(eq(Activity.occurredAt, after.occurredAt), lt(Activity.id, after.id)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(Activity.occurredAt), desc(Activity.id))
    .limit(LIVE_PAGE_SIZE + 1)
    .pipe(orDieOnDbError);

  // Only the first page needs it, for the empty state.
  let hasConnections = true;
  if (after === undefined) {
    const [connection] = yield* db
      .select({ low: Connections.userLow })
      .from(Connections)
      .where(or(eq(Connections.userLow, viewerId), eq(Connections.userHigh, viewerId)))
      .limit(1)
      .pipe(orDieOnDbError);
    hasConnections = connection !== undefined;
  }

  const page = rows.slice(0, LIVE_PAGE_SIZE);
  const last = page.at(-1);
  return new LivePage({
    events: page.map((row) => {
      const display = liveDisplay(viewerId, row.userId, row.privacy!);
      return new LiveEvent({
        id: row.id,
        actor: new LiveActor({
          username: row.username!,
          name: row.name,
          image: row.image,
          color: (row.color as UserColor | null) ?? null,
        }),
        mine: row.userId === viewerId,
        kind: row.kind,
        occurredAt: row.occurredAt,
        display,
        title: display === "full" ? row.title : null,
        meta: eventMeta(row),
      });
    }),
    nextCursor: rows.length > LIVE_PAGE_SIZE && last ? encodeItemCursor(last.occurredAt, last.id) : null,
    hasConnections,
  });
});

/** The kind-specific numbers of an activity row (goal moves, sessions, habit taps). */
export const eventMeta = (row: {
  kind: LiveEvent["kind"];
  meta: Record<string, unknown>;
  plannedMinutes: number | null;
  focusedMinutes: number | null;
}): LiveEventMeta => {
  const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
  switch (row.kind) {
    case "goal_progressed": {
      const before = number(row.meta.valueBefore);
      const after = number(row.meta.valueAfter);
      return new LiveEventMeta({
        percent: number(row.meta.percent),
        rose: before === null || after === null ? null : after > before,
        minutes: null,
        count: null,
      });
    }
    case "session_started":
    case "session_completed":
      return new LiveEventMeta({ percent: null, rose: null, minutes: row.plannedMinutes, count: null });
    case "session_stopped":
      return new LiveEventMeta({ percent: null, rose: null, minutes: row.focusedMinutes, count: null });
    case "habit_checked":
      return new LiveEventMeta({ percent: null, rose: null, minutes: null, count: number(row.meta.count) });
    default:
      return new LiveEventMeta({ percent: null, rose: null, minutes: null, count: null });
  }
};

/** What a Path lists from the activity feed; habit taps come from `habit_checkins`. */
const PATH_ACTIVITY = ["task_settled", "goal_progressed", "session_completed"] as const;

/** `viewerId`'s Path for today in their zone: tasks settled, habits checked, goals moved, sessions completed. */
export const getPath = Effect.fn("getPath")(function* (viewerId: string) {
  const db = yield* Database;
  const [settings] = yield* db
    .select({ timeZone: UserSettings.timeZone })
    .from(UserSettings)
    .where(eq(UserSettings.userId, viewerId))
    .pipe(orDieOnDbError);
  const today = todayIn(settings?.timeZone ?? FALLBACK_TIME_ZONE);

  const activity = yield* db
    .select({
      id: Activity.id,
      kind: Activity.kind,
      occurredAt: Activity.occurredAt,
      meta: Activity.meta,
      title: activitySubjectTitle,
      plannedMinutes: FocusSessions.plannedMinutes,
    })
    .from(Activity)
    .leftJoin(Tasks, activitySubjectJoin.task)
    .leftJoin(Goals, activitySubjectJoin.goal)
    .leftJoin(FocusSessions, activitySubjectJoin.session)
    // Unused joins keep the shared subject columns valid.
    .leftJoin(Habits, activitySubjectJoin.habit)
    .leftJoin(Notes, activitySubjectJoin.note)
    .where(
      and(
        eq(Activity.userId, viewerId),
        eq(Activity.localDate, today),
        inArray(Activity.kind, [...PATH_ACTIVITY]),
        activitySubjectExists,
      ),
    )
    .pipe(orDieOnDbError);

  const checkins = yield* db
    .select({
      id: HabitCheckins.id,
      occurredAt: HabitCheckins.updatedAt,
      count: HabitCheckins.count,
      title: Habits.title,
    })
    .from(HabitCheckins)
    .innerJoin(Habits, eq(Habits.id, HabitCheckins.habitId))
    .where(and(eq(HabitCheckins.userId, viewerId), eq(HabitCheckins.localDate, today), gt(HabitCheckins.count, 0)))
    .pipe(orDieOnDbError);

  const events = [
    ...activity.map((row) => {
      const live = eventMeta({ ...row, focusedMinutes: null });
      return new PathEvent({
        id: row.id,
        kind: row.kind as PathEvent["kind"],
        occurredAt: row.occurredAt,
        title: row.title,
        meta: new PathEventMeta({ percent: live.percent, rose: live.rose, minutes: live.minutes, count: null }),
      });
    }),
    ...checkins.map(
      (row) =>
        new PathEvent({
          id: row.id,
          kind: "habit_checked",
          occurredAt: row.occurredAt,
          title: row.title,
          meta: new PathEventMeta({ percent: null, rose: null, minutes: null, count: row.count }),
        }),
    ),
  ].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || (a.id < b.id ? -1 : 1));
  return new Path({ date: today, events });
});

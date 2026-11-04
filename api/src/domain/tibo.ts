import { asc, eq, inArray, lt } from "drizzle-orm";
import * as Effect from "effect/Effect";
import { TiboEvents, TiboWipes, UserSettings } from "../schema.ts";
import { AuthUsers } from "./auth-users.ts";
import { Database, newId, orDieOnDbError, type Executor } from "./database.ts";
import { FALLBACK_TIME_ZONE } from "./dates.ts";
import {
  TIBO_EVENING_TIME_DEFAULT,
  TIBO_MORNING_TIME_DEFAULT,
  type TiboEventKind,
  type TiboEveningTime,
  type TiboMorningTime,
} from "./tibo-constants.ts";

// What the `TiboAgent` Durable Object reads from Postgres (through the
// DomainWorker, `../DomainWorker.ts`), the queue of threads to wipe after
// account deletion, and the outbox of domain events for the agent.

/** The user facts every Tibo turn needs. */
export interface TiboProfile {
  readonly firstName: string;
  readonly timeZone: string;
}

/** The first word of the user's name ("there" if they have none). */
export const firstNameOf = (name: string | null | undefined) =>
  name?.trim().split(/\s+/)[0] || "there";

export const getTiboProfile = Effect.fn("getTiboProfile")(function* (userId: string) {
  const db = yield* Database;
  const [row] = yield* db
    .select({ name: AuthUsers.name, timeZone: UserSettings.timeZone })
    .from(AuthUsers)
    .leftJoin(UserSettings, eq(UserSettings.userId, AuthUsers.id))
    .where(eq(AuthUsers.id, userId))
    .pipe(orDieOnDbError);
  return {
    firstName: firstNameOf(row?.name),
    timeZone: row?.timeZone ?? FALLBACK_TIME_ZONE,
  } satisfies TiboProfile;
});

/** Queues the user's Tibo thread for wiping, in account deletion's transaction. */
export const queueTiboWipe = (tx: Executor, userId: string) =>
  tx.insert(TiboWipes).values({ userId }).onConflictDoNothing();

/** The oldest queued wipes. */
export const pendingTiboWipes = Effect.fn("pendingTiboWipes")(function* (limit: number) {
  const db = yield* Database;
  const rows = yield* db
    .select({ userId: TiboWipes.userId })
    .from(TiboWipes)
    .orderBy(TiboWipes.requestedAt)
    .limit(limit)
    .pipe(orDieOnDbError);
  return rows.map((row) => row.userId);
});

/** Removes wipes that are done. */
export const clearTiboWipes = Effect.fn("clearTiboWipes")(function* (userIds: readonly string[]) {
  if (userIds.length === 0) return;
  const db = yield* Database;
  yield* db.delete(TiboWipes).where(inArray(TiboWipes.userId, [...userIds])).pipe(orDieOnDbError);
});

// ─── Check-ins (step 20) ─────────────────────────────────────────────────────

/** The user's check-in settings, as `Settings` names them. */
export interface TiboProactiveSettings {
  readonly enabled: boolean;
  readonly morningPlan: boolean;
  readonly morningTime: TiboMorningTime;
  readonly deadlineNudges: boolean;
  readonly habitCheck: boolean;
  readonly eveningTime: TiboEveningTime;
}

/** What the agent reads before planning or sending a check-in. */
export interface TiboProactiveContext extends TiboProfile {
  readonly proactive: TiboProactiveSettings;
}

export const getTiboProactive = Effect.fn("getTiboProactive")(function* (userId: string) {
  const db = yield* Database;
  const [row] = yield* db
    .select({ name: AuthUsers.name, settings: UserSettings })
    .from(AuthUsers)
    .leftJoin(UserSettings, eq(UserSettings.userId, AuthUsers.id))
    .where(eq(AuthUsers.id, userId))
    .pipe(orDieOnDbError);
  const settings = row?.settings;
  return {
    firstName: firstNameOf(row?.name),
    timeZone: settings?.timeZone ?? FALLBACK_TIME_ZONE,
    // No row yet (the app never loaded): the column defaults, but off, so
    // nothing reaches someone who never opened the app.
    proactive: {
      enabled: settings?.tiboProactive ?? false,
      morningPlan: settings?.tiboMorningPlan ?? true,
      morningTime: settings?.tiboMorningTime ?? TIBO_MORNING_TIME_DEFAULT,
      deadlineNudges: settings?.tiboDeadlineNudges ?? true,
      habitCheck: settings?.tiboHabitCheck ?? true,
      eveningTime: settings?.tiboEveningTime ?? TIBO_EVENING_TIME_DEFAULT,
    },
  } satisfies TiboProactiveContext;
});

/** An outbox row as the agent receives it. */
export interface TiboEventJson {
  readonly id: string;
  readonly userId: string;
  readonly kind: TiboEventKind;
  readonly payload: Record<string, unknown>;
  /** ISO instant. */
  readonly createdAt: string;
}

/** Events older than this are dropped undelivered (the agent would ignore them anyway). */
const TIBO_EVENT_MAX_AGE_MS = 24 * 60 * 60_000;

/** Queues an event for the user's `TiboAgent`, in the caller's transaction. */
export const queueTiboEvent = (
  tx: Executor,
  userId: string,
  kind: TiboEventKind,
  payload: Record<string, unknown> = {},
) => tx.insert(TiboEvents).values({ id: newId(), userId, kind, payload });

/** The oldest queued events (dropping any a day old first). */
export const pendingTiboEvents = Effect.fn("pendingTiboEvents")(function* (limit: number) {
  const db = yield* Database;
  yield* db
    .delete(TiboEvents)
    .where(lt(TiboEvents.createdAt, new Date(Date.now() - TIBO_EVENT_MAX_AGE_MS)))
    .pipe(orDieOnDbError);
  const rows = yield* db
    .select()
    .from(TiboEvents)
    .orderBy(asc(TiboEvents.createdAt))
    .limit(limit)
    .pipe(orDieOnDbError);
  return rows.map(
    (row): TiboEventJson => ({
      id: row.id,
      userId: row.userId,
      kind: row.kind,
      payload: row.payload,
      createdAt: row.createdAt.toISOString(),
    }),
  );
});

/** Removes delivered events. */
export const clearTiboEvents = Effect.fn("clearTiboEvents")(function* (ids: readonly string[]) {
  if (ids.length === 0) return;
  const db = yield* Database;
  yield* db.delete(TiboEvents).where(inArray(TiboEvents.id, [...ids])).pipe(orDieOnDbError);
});

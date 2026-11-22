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

export interface TiboProfile {
  readonly firstName: string;
  readonly timeZone: string;
}

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

export const queueTiboWipe = (tx: Executor, userId: string) =>
  tx.insert(TiboWipes).values({ userId }).onConflictDoNothing();

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

export const clearTiboWipes = Effect.fn("clearTiboWipes")(function* (userIds: readonly string[]) {
  if (userIds.length === 0) return;
  const db = yield* Database;
  yield* db.delete(TiboWipes).where(inArray(TiboWipes.userId, [...userIds])).pipe(orDieOnDbError);
});

export interface TiboProactiveSettings {
  readonly enabled: boolean;
  readonly morningPlan: boolean;
  readonly morningTime: TiboMorningTime;
  readonly deadlineNudges: boolean;
  readonly habitCheck: boolean;
  readonly eveningTime: TiboEveningTime;
}

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

export interface TiboEventJson {
  readonly id: string;
  readonly userId: string;
  readonly kind: TiboEventKind;
  readonly payload: Record<string, unknown>;
  readonly createdAt: string;
}

const TIBO_EVENT_MAX_AGE_MS = 24 * 60 * 60_000;

export const queueTiboEvent = (
  tx: Executor,
  userId: string,
  kind: TiboEventKind,
  payload: Record<string, unknown> = {},
) => tx.insert(TiboEvents).values({ id: newId(), userId, kind, payload });

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

export const clearTiboEvents = Effect.fn("clearTiboEvents")(function* (ids: readonly string[]) {
  if (ids.length === 0) return;
  const db = yield* Database;
  yield* db.delete(TiboEvents).where(inArray(TiboEvents.id, [...ids])).pipe(orDieOnDbError);
});

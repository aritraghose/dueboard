import { eq, inArray } from "drizzle-orm";
import * as Effect from "effect/Effect";
import { TiboWipes, UserSettings } from "../schema.ts";
import { AuthUsers } from "./auth-users.ts";
import { Database, orDieOnDbError, type Executor } from "./database.ts";
import { FALLBACK_TIME_ZONE } from "./dates.ts";

// What the `TiboAgent` Durable Object reads from Postgres (through the
// DomainWorker, `../DomainWorker.ts`), and the queue of threads to wipe after
// account deletion.

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

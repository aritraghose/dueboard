import { and, eq, ne } from "drizzle-orm";
import * as Effect from "effect/Effect";
import { Tags, UserSettings, type UserSettingsRow } from "../schema.ts";
import { FALLBACK_TIME_ZONE, isValidTimeZone } from "./dates.ts";
import { Database, newId, orDieOnDbError, transaction } from "./database.ts";
import { Settings, SettingsPatch, USER_COLOR, decodeInput, type UserColor } from "./model.ts";
import { SYSTEM_TAGS, listTags } from "./tags.ts";

// Per-user settings: time zone, privacy defaults and relay policy. The row
// and the system tags are created lazily by `ensureUserSetup`, which
// `Bootstrap` runs on every app load, so accounts made before this table
// existed are backfilled the next time they open the app.

const toSettings = (row: UserSettingsRow): Settings =>
  new Settings({
    timeZone: row.timeZone,
    color: row.color,
    defaultPrivacy: row.defaultPrivacy,
    defaultShareToTimeline: row.defaultShareToTimeline,
    relayPolicy: row.relayPolicy,
  });

// `Bootstrap` creates the row on every app load, so a missing one is a bug.
const missingSettings = (userId: string) =>
  Effect.die(new Error(`User ${userId} has no settings; run ensureUserSetup first`));

/** A uniformly random user color. */
export const randomUserColor = (): UserColor =>
  USER_COLOR[crypto.getRandomValues(new Uint32Array(1))[0]! % USER_COLOR.length]!;

/**
 * Creates the user's settings row and three system tags if they're missing.
 * Idempotent and safe to run concurrently (two tabs loading at once): both
 * inserts skip rows that already exist. `timeZone` is used only for a new
 * row, and falls back to UTC when invalid. A new row also gets a random
 * color, which never changes afterwards.
 */
export const ensureUserSetup = Effect.fn("ensureUserSetup")(function* (
  userId: string,
  timeZone: string,
) {
  const db = yield* Database;
  yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      yield* tx
        .insert(UserSettings)
        .values({
          userId,
          timeZone: isValidTimeZone(timeZone) ? timeZone : FALLBACK_TIME_ZONE,
          color: randomUserColor(),
        })
        .onConflictDoNothing();
      // Conflicts on either unique index (name, or one tag per system kind).
      yield* tx
        .insert(Tags)
        .values(
          SYSTEM_TAGS.map(({ kind, name, color }) => ({
            id: newId(),
            userId,
            name,
            color,
            systemKind: kind,
          })),
        )
        .onConflictDoNothing();
    }),
  );
});

export const getSettings = Effect.fn("getSettings")(function* (userId: string) {
  const db = yield* Database;
  const [row] = yield* db
    .select()
    .from(UserSettings)
    .where(eq(UserSettings.userId, userId))
    .pipe(orDieOnDbError);
  if (!row) return yield* missingSettings(userId);
  return toSettings(row);
});

/** Changes the fields `patch` names. The time zone follows the browser (`syncTimeZone`). */
export const updateSettings = Effect.fn("updateSettings")(function* (
  userId: string,
  patch: SettingsPatch,
) {
  const values = yield* decodeInput(SettingsPatch)(patch);
  if (Object.keys(values).length === 0) return yield* getSettings(userId);
  const db = yield* Database;
  const [row] = yield* db
    .update(UserSettings)
    .set(values)
    .where(eq(UserSettings.userId, userId))
    .returning()
    .pipe(orDieOnDbError);
  if (!row) return yield* missingSettings(userId);
  return toSettings(row);
});

/**
 * Saves the browser's time zone when it's valid and differs from the stored
 * one, so a travelling user's "today" follows them. An invalid zone is
 * ignored. Returns the settings either way.
 */
export const syncTimeZone = Effect.fn("syncTimeZone")(function* (userId: string, timeZone: string) {
  if (!isValidTimeZone(timeZone)) return yield* getSettings(userId);
  const db = yield* Database;
  const [row] = yield* db
    .update(UserSettings)
    .set({ timeZone })
    .where(and(eq(UserSettings.userId, userId), ne(UserSettings.timeZone, timeZone)))
    .returning()
    .pipe(orDieOnDbError);
  return row ? toSettings(row) : yield* getSettings(userId);
});

/** Everything the app needs on load: sets the user up, syncs the zone, returns settings and tags. */
export const bootstrap = Effect.fn("bootstrap")(function* (userId: string, timeZone: string) {
  yield* ensureUserSetup(userId, timeZone);
  const settings = yield* syncTimeZone(userId, timeZone);
  const tags = yield* listTags(userId);
  return { settings, tags };
});

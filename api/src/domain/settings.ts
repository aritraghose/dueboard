import { and, eq, ne } from "drizzle-orm";
import * as Effect from "effect/Effect";
import { Tags, UserSettings, type UserSettingsRow } from "../schema.ts";
import { FALLBACK_TIME_ZONE, isValidTimeZone } from "./dates.ts";
import { Database, newId, orDieOnDbError, transaction } from "./database.ts";
import { Settings, SettingsPatch, TIBO_PROACTIVE_KEYS, USER_COLOR, decodeInput, type UserColor } from "./model.ts";
import { SYSTEM_TAGS, listTags } from "./tags.ts";
import { queueTiboEvent } from "./tibo.ts";

const toSettings = (row: UserSettingsRow): Settings =>
  new Settings({
    timeZone: row.timeZone,
    color: row.color,
    defaultPrivacy: row.defaultPrivacy,
    defaultShareToLive: row.defaultShareToLive,
    relayPolicy: row.relayPolicy,
    tiboProactive: row.tiboProactive,
    tiboMorningPlan: row.tiboMorningPlan,
    tiboMorningTime: row.tiboMorningTime,
    tiboDeadlineNudges: row.tiboDeadlineNudges,
    tiboHabitCheck: row.tiboHabitCheck,
    tiboEveningTime: row.tiboEveningTime,
  });

const missingSettings = (userId: string) =>
  Effect.die(new Error(`User ${userId} has no settings; run ensureUserSetup first`));

export const randomUserColor = (): UserColor =>
  USER_COLOR[crypto.getRandomValues(new Uint32Array(1))[0]! % USER_COLOR.length]!;

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

export const updateSettings = Effect.fn("updateSettings")(function* (
  userId: string,
  patch: SettingsPatch,
) {
  const values = yield* decodeInput(SettingsPatch)(patch);
  if (Object.keys(values).length === 0) return yield* getSettings(userId);
  const db = yield* Database;
  const touchesTibo = TIBO_PROACTIVE_KEYS.some((key) => key in values);
  const row = yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const [updated] = yield* tx
        .update(UserSettings)
        .set(values)
        .where(eq(UserSettings.userId, userId))
        .returning();
      if (updated && touchesTibo) yield* queueTiboEvent(tx, userId, "settings_changed");
      return updated;
    }),
  );
  if (!row) return yield* missingSettings(userId);
  return toSettings(row);
});

export const syncTimeZone = Effect.fn("syncTimeZone")(function* (userId: string, timeZone: string) {
  if (!isValidTimeZone(timeZone)) return yield* getSettings(userId);
  const db = yield* Database;
  const row = yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const [updated] = yield* tx
        .update(UserSettings)
        .set({ timeZone })
        .where(and(eq(UserSettings.userId, userId), ne(UserSettings.timeZone, timeZone)))
        .returning();
      if (updated) yield* queueTiboEvent(tx, userId, "settings_changed");
      return updated;
    }),
  );
  return row ? toSettings(row) : yield* getSettings(userId);
});

export const bootstrap = Effect.fn("bootstrap")(function* (userId: string, timeZone: string) {
  yield* ensureUserSetup(userId, timeZone);
  const settings = yield* syncTimeZone(userId, timeZone);
  const tags = yield* listTags(userId);
  return { settings, tags };
});

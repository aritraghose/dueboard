import { and, eq, sql } from "drizzle-orm";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { AiUsageEvents, AiUsageTotals, UserSettings } from "../schema.ts";
import { FALLBACK_TIME_ZONE, isValidTimeZone } from "./dates.ts";
import { Database, newId, orDieOnDbError, transaction, type Executor } from "./database.ts";
import { AI_UNITS_PER_CHARGE_MAX, type AiUsageReason } from "./model.ts";
import { fits, limitFor, periodOf, toAiUsage } from "./usage-rules.ts";

// The AI usage quota ledger (architecture.md §8). Every AI feature checks
// `canSpend` before a model call and calls `recordUsage` (or `chargeSplit`
// for a relay) after it succeeds. The month is the user's, so it resets at
// their local midnight on the 1st. Recording never refuses: the check
// before the call is the gate, so a race can only overshoot by one turn.
//
// The AgentWorker reaches these through the DomainWorker
// (`../DomainWorker.ts`).

/** The monthly quota in messages (`AI_MONTHLY_MESSAGE_QUOTA`), provided by `../api.ts` and `../DomainWorker.ts`. */
export class AiQuota extends Context.Service<AiQuota, { readonly monthlyMessages: number }>()(
  "api/AiQuota",
) {}

/** The user's zone and override. A user with no settings row yet gets UTC and the default. */
const accountOf = Effect.fn("usage.accountOf")(function* (db: Executor, userId: string) {
  const [row] = yield* db
    .select({ timeZone: UserSettings.timeZone, override: UserSettings.aiQuotaOverride })
    .from(UserSettings)
    .where(eq(UserSettings.userId, userId))
    .pipe(orDieOnDbError);
  const quota = yield* AiQuota;
  return {
    timeZone: row && isValidTimeZone(row.timeZone) ? row.timeZone : FALLBACK_TIME_ZONE,
    limit: limitFor(row?.override ?? null, quota.monthlyMessages),
  };
});

const usedUnits = Effect.fn("usage.usedUnits")(function* (
  db: Executor,
  userId: string,
  period: string,
) {
  const [row] = yield* db
    .select({ units: AiUsageTotals.units })
    .from(AiUsageTotals)
    .where(and(eq(AiUsageTotals.userId, userId), eq(AiUsageTotals.period, period)))
    .pipe(orDieOnDbError);
  return row?.units ?? 0;
});

/** The user's usage this month, in messages. */
export const getUsage = Effect.fn("getUsage")(function* (userId: string) {
  const db = yield* Database;
  const now = new Date();
  const { timeZone, limit } = yield* accountOf(db, userId);
  const used = yield* usedUnits(db, userId, periodOf(now, timeZone));
  return toAiUsage(used, limit, now, timeZone);
});

/** The user's zone (UTC with no settings row yet), for counting their months. */
export const timeZoneOf = Effect.fn("usage.timeZoneOf")(function* (db: Executor, userId: string) {
  return (yield* accountOf(db, userId)).timeZone;
});

/** Whether `units` more fit in the user's quota this month. */
export const canSpend = Effect.fn("canSpend")(function* (userId: string, units: number) {
  const db = yield* Database;
  const { timeZone, limit } = yield* accountOf(db, userId);
  const used = yield* usedUnits(db, userId, periodOf(new Date(), timeZone));
  return fits(used, limit, units);
});

const checkUnits = (units: number) =>
  Number.isInteger(units) && units > 0 && units <= AI_UNITS_PER_CHARGE_MAX
    ? Effect.void
    : Effect.die(new Error(`Invalid AI usage charge: ${units} units`));

/**
 * Adds `units` to the user's month and logs the charge, in `tx`. Exported
 * for services that charge inside their own transaction (`./ask.ts`); check
 * `canSpend` first.
 */
export const charge = Effect.fn("usage.charge")(function* (
  tx: Executor,
  userId: string,
  units: number,
  reason: AiUsageReason,
  ref: string | null,
) {
  yield* checkUnits(units);
  const { timeZone } = yield* accountOf(tx, userId);
  const period = periodOf(new Date(), timeZone);
  yield* tx
    .insert(AiUsageTotals)
    .values({ userId, period, units })
    .onConflictDoUpdate({
      target: [AiUsageTotals.userId, AiUsageTotals.period],
      set: { units: sql`${AiUsageTotals.units} + excluded.units`, updatedAt: new Date() },
    });
  yield* tx.insert(AiUsageEvents).values({ id: newId(), userId, units, reason, ref });
});

/**
 * Records a charge after a successful model call: one atomic upsert of the
 * month's total plus an event row. Returns the usage after it.
 */
export const recordUsage = Effect.fn("recordUsage")(function* (
  userId: string,
  units: number,
  reason: AiUsageReason,
  ref: string | null = null,
) {
  const db = yield* Database;
  yield* transaction(db, (tx) => charge(tx, userId, units, reason, ref));
  return yield* getUsage(userId);
});

/**
 * Charges `unitsEach` to both users of a relay turn (1 unit = half a
 * message each), in one transaction. Check both with `canSpend` first.
 */
export const chargeSplit = Effect.fn("chargeSplit")(function* (
  userA: string,
  userB: string,
  unitsEach: number,
  reason: AiUsageReason,
  ref: string | null = null,
) {
  yield* checkUnits(unitsEach);
  const db = yield* Database;
  yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      yield* charge(tx, userA, unitsEach, reason, ref);
      yield* charge(tx, userB, unitsEach, reason, ref);
    }),
  );
});

import { localDateOf, startOfDayInstant, startOfMonth } from "./dates.ts";
import { AiUsage } from "./model.ts";
import { AI_UNITS_PER_MESSAGE } from "./usage-constants.ts";

// The AI quota's pure rules (architecture.md §8): which month a charge
// falls in, when it resets, and what's left. The ledger counts units (one
// message = 2); the user sees messages.

/** The month (`YYYY-MM`) `now` falls in, in `timeZone`. */
export const periodOf = (now: Date, timeZone: string): string =>
  localDateOf(now, timeZone).slice(0, 7);

/** When the month after `now`'s begins in `timeZone`. */
export const nextResetAt = (now: Date, timeZone: string): Date =>
  startOfDayInstant(startOfMonth(localDateOf(now, timeZone), 1), timeZone);

/** The monthly limit in messages: the user's override, else the configured quota. */
export const limitFor = (override: number | null, quota: number): number =>
  Math.max(0, override ?? quota);

/** Units still free this month (never negative). */
export const remainingUnits = (usedUnits: number, limitMessages: number): number =>
  Math.max(0, limitMessages * AI_UNITS_PER_MESSAGE - usedUnits);

/** Whether `units` more fit under the limit. */
export const fits = (usedUnits: number, limitMessages: number, units: number): boolean =>
  units <= remainingUnits(usedUnits, limitMessages);

/**
 * The usage the user sees. `remaining` counts whole messages, and `used` is
 * the rest of the limit, so the two always add up to it.
 */
export const toAiUsage = (
  usedUnits: number,
  limitMessages: number,
  now: Date,
  timeZone: string,
): AiUsage => {
  const remaining = Math.floor(remainingUnits(usedUnits, limitMessages) / AI_UNITS_PER_MESSAGE);
  return new AiUsage({
    used: limitMessages - remaining,
    limit: limitMessages,
    remaining,
    period: periodOf(now, timeZone),
    resetsAt: nextResetAt(now, timeZone),
  });
};

import { localDateOf, startOfDayInstant, startOfMonth } from "./dates.ts";
import { AiUsage } from "./model.ts";
import { AI_UNITS_PER_MESSAGE } from "./usage-constants.ts";

export const periodOf = (now: Date, timeZone: string): string =>
  localDateOf(now, timeZone).slice(0, 7);

export const nextResetAt = (now: Date, timeZone: string): Date =>
  startOfDayInstant(startOfMonth(localDateOf(now, timeZone), 1), timeZone);

export const limitFor = (override: number | null, quota: number): number =>
  Math.max(0, override ?? quota);

export const remainingUnits = (usedUnits: number, limitMessages: number): number =>
  Math.max(0, limitMessages * AI_UNITS_PER_MESSAGE - usedUnits);

export const fits = (usedUnits: number, limitMessages: number, units: number): boolean =>
  units <= remainingUnits(usedUnits, limitMessages);

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

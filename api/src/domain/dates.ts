import * as Schema from "effect/Schema";

// Calendar dates in a user's time zone. Pure, `Intl` only, so the same code
// runs in the Worker and in the browser. A `LocalDate` is a plain
// `YYYY-MM-DD` string; date math on it is done in UTC, where every day has
// 24 hours, so DST changes in the user's zone never shift a day.

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whether `value` is `YYYY-MM-DD` and names a real calendar day. */
export const isLocalDate = (value: string): boolean => {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

/** A calendar day (`YYYY-MM-DD`) in some user's time zone. */
export const LocalDate = Schema.String.check(
  Schema.makeFilter((value: string) => isLocalDate(value) || "Expected a date as YYYY-MM-DD"),
).pipe(Schema.brand("LocalDate"));
export type LocalDate = typeof LocalDate.Type;

/** The zone used when a user's zone is unknown or invalid. */
export const FALLBACK_TIME_ZONE = "UTC";

/**
 * Whether `timeZone` is an IANA zone name this runtime knows
 * (`America/New_York`, `UTC`). Offset zones such as `+05:00` are rejected:
 * they don't follow DST, so they'd put a travelling user on the wrong day.
 */
export const isValidTimeZone = (timeZone: string): boolean => {
  if (timeZone.length === 0 || timeZone.length > 64 || !/^[A-Za-z]/.test(timeZone)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
};

// Building a formatter is slow; one per zone is reused.
const formatters = new Map<string, Intl.DateTimeFormat>();
const formatterFor = (timeZone: string) => {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
};

/** The calendar day `instant` falls on in `timeZone`. Throws on an invalid zone. */
export const localDateOf = (instant: Date, timeZone: string): LocalDate => {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}` as LocalDate;
};

/** Today in `timeZone`. `now` is for tests. */
export const todayIn = (timeZone: string, now: Date = new Date()): LocalDate =>
  localDateOf(now, timeZone);

const toUtc = (date: LocalDate): Date => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
};

const fromUtc = (date: Date): LocalDate => date.toISOString().slice(0, 10) as LocalDate;

/** `date` moved by `days` (negative goes back). */
export const addDays = (date: LocalDate, days: number): LocalDate => {
  const utc = toUtc(date);
  utc.setUTCDate(utc.getUTCDate() + days);
  return fromUtc(utc);
};

/** The Sunday on or before `date`. Weeks start on Sunday. */
export const startOfWeek = (date: LocalDate): LocalDate => addDays(date, -toUtc(date).getUTCDay());

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export const daysBetween = (from: LocalDate, to: LocalDate): number =>
  Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);

/** 0 = Sunday … 6 = Saturday. */
export const dayOfWeek = (date: LocalDate): number => toUtc(date).getUTCDay();

/** The number of days in `date`'s month. */
export const daysInMonth = (date: LocalDate): number => {
  const [y, m] = date.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/** The first day of `date`'s month, moved by `months` (negative goes back). */
export const startOfMonth = (date: LocalDate, months = 0): LocalDate => {
  const [y, m] = date.split("-").map(Number) as [number, number];
  return fromUtc(new Date(Date.UTC(y, m - 1 + months, 1)));
};

/** Months from `from`'s month to `to`'s month, ignoring the days. */
export const monthsBetween = (from: LocalDate, to: LocalDate): number => {
  const [fy, fm] = from.split("-").map(Number) as [number, number];
  const [ty, tm] = to.split("-").map(Number) as [number, number];
  return (ty - fy) * 12 + (tm - fm);
};

// Wall-clock parts, for the zone's UTC offset at an instant.
const clockFormatters = new Map<string, Intl.DateTimeFormat>();
const clockFormatterFor = (timeZone: string) => {
  let formatter = clockFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    clockFormatters.set(timeZone, formatter);
  }
  return formatter;
};

/** How far `timeZone`'s wall clock is ahead of UTC at `instant`, in ms. */
const offsetAt = (instant: number, timeZone: string): number => {
  const parts = clockFormatterFor(timeZone).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wall = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
  return wall - Math.floor(instant / 1000) * 1000;
};

/**
 * The instant `date` begins in `timeZone`. When a DST change skips
 * midnight, the first instant of the day after the gap. Throws on an
 * invalid zone.
 */
export const startOfDayInstant = (date: LocalDate, timeZone: string): Date => {
  const midnight = toUtc(date).getTime();
  // Guess with the offset at UTC midnight, then correct once with the
  // offset at the guess, which covers a change between the two.
  let instant = midnight - offsetAt(midnight, timeZone);
  instant = midnight - offsetAt(instant, timeZone);
  // Inside a skipped hour the result lands on the day before: move on.
  if (localDateOf(new Date(instant), timeZone) !== date) instant += 3_600_000;
  return new Date(instant);
};

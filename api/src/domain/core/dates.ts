import * as Schema from "effect/Schema";

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isLocalDate = (value: string): boolean => {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

export const LocalDate = Schema.String.check(
  Schema.makeFilter((value: string) => isLocalDate(value) || "Expected a date as YYYY-MM-DD"),
).pipe(Schema.brand("LocalDate"));
export type LocalDate = typeof LocalDate.Type;

export const FALLBACK_TIME_ZONE = "UTC";

export const isValidTimeZone = (timeZone: string): boolean => {
  if (timeZone.length === 0 || timeZone.length > 64 || !/^[A-Za-z]/.test(timeZone)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
};

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

export const localDateOf = (instant: Date, timeZone: string): LocalDate => {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}` as LocalDate;
};

export const todayIn = (timeZone: string, now: Date = new Date()): LocalDate =>
  localDateOf(now, timeZone);

const toUtc = (date: LocalDate): Date => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
};

const fromUtc = (date: Date): LocalDate => date.toISOString().slice(0, 10) as LocalDate;

export const addDays = (date: LocalDate, days: number): LocalDate => {
  const utc = toUtc(date);
  utc.setUTCDate(utc.getUTCDate() + days);
  return fromUtc(utc);
};

export const startOfWeek = (date: LocalDate): LocalDate => addDays(date, -toUtc(date).getUTCDay());

export const daysBetween = (from: LocalDate, to: LocalDate): number =>
  Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);

export const dayOfWeek = (date: LocalDate): number => toUtc(date).getUTCDay();

export const daysInMonth = (date: LocalDate): number => {
  const [y, m] = date.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

export const startOfMonth = (date: LocalDate, months = 0): LocalDate => {
  const [y, m] = date.split("-").map(Number) as [number, number];
  return fromUtc(new Date(Date.UTC(y, m - 1 + months, 1)));
};

export const monthsBetween = (from: LocalDate, to: LocalDate): number => {
  const [fy, fm] = from.split("-").map(Number) as [number, number];
  const [ty, tm] = to.split("-").map(Number) as [number, number];
  return (ty - fy) * 12 + (tm - fm);
};

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

export const startOfDayInstant = (date: LocalDate, timeZone: string): Date => {
  const midnight = toUtc(date).getTime();
  let instant = midnight - offsetAt(midnight, timeZone);
  instant = midnight - offsetAt(instant, timeZone);
  if (localDateOf(new Date(instant), timeZone) !== date) instant += 3_600_000;
  return new Date(instant);
};

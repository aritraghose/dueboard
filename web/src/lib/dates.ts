import { LocalDate, addDays, localDateOf, startOfWeek, todayIn } from "@dueboard/api/rpc";
import * as Schema from "effect/Schema";

export { LocalDate, addDays, localDateOf, startOfWeek, todayIn };

export const isLocalDate = Schema.is(LocalDate);

export const WEEK_STARTS_ON = 0;

const atNoonUtc = (date: LocalDate) => new Date(`${date}T12:00:00Z`);

const dayFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
});
const dayFormatWithYear = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const longDayFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

export const formatDay = (date: LocalDate, today?: LocalDate): string =>
  (today && date.slice(0, 4) !== today.slice(0, 4) ? dayFormatWithYear : dayFormat).format(
    atNoonUtc(date),
  );

export const formatDayLong = (date: LocalDate): string => longDayFormat.format(atNoonUtc(date));

export const daysBetween = (from: LocalDate, to: LocalDate): number =>
  Math.round((atNoonUtc(to).getTime() - atNoonUtc(from).getTime()) / 86_400_000);

export const relativeDay = (date: LocalDate, today: LocalDate): string => {
  const days = daysBetween(today, date);
  if (days === 0) return "Today";
  if (days === -1) return "Yesterday";
  if (days === 1) return "Tomorrow";
  return days > 0 ? `In ${days} days` : `${-days} days ago`;
};

const clockFormats = new Map<string, Intl.DateTimeFormat>();

export const formatClock = (instant: Date, timeZone: string): string => {
  let format = clockFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
    clockFormats.set(timeZone, format);
  }
  return format.format(instant);
};

const timeFormats = new Map<string, Intl.DateTimeFormat>();

export const formatTime = (instant: Date, timeZone: string): string => {
  let format = timeFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
    timeFormats.set(timeZone, format);
  }
  return format.format(instant);
};

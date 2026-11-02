import { LocalDate, addDays, startOfWeek, todayIn } from "@dueboard/api/rpc";
import * as Schema from "effect/Schema";

// Display helpers for calendar days. Date math comes from the API's
// `domain/dates.ts`, so the browser and the Worker agree on what "today" is.
// A `LocalDate` names a day, not an instant, so it's formatted in UTC; only
// instants (the clock) are formatted in the user's time zone.

export { LocalDate, addDays, startOfWeek, todayIn };

export const isLocalDate = Schema.is(LocalDate);

/** Weeks start on Sunday (`Intl` week info is not used). */
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

/**
 * "Sun, Nov 1". The year is added ("Sun, Nov 1, 2025") when `date` isn't in
 * the same year as `today`.
 */
export const formatDay = (date: LocalDate, today?: LocalDate): string =>
  (today && date.slice(0, 4) !== today.slice(0, 4) ? dayFormatWithYear : dayFormat).format(
    atNoonUtc(date),
  );

/** "Sunday, November 1, 2026", for screen readers and tooltips. */
export const formatDayLong = (date: LocalDate): string => longDayFormat.format(atNoonUtc(date));

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export const daysBetween = (from: LocalDate, to: LocalDate): number =>
  Math.round((atNoonUtc(to).getTime() - atNoonUtc(from).getTime()) / 86_400_000);

/** "Today", "Yesterday", "Tomorrow", "In 3 days", "5 days ago". */
export const relativeDay = (date: LocalDate, today: LocalDate): string => {
  const days = daysBetween(today, date);
  if (days === 0) return "Today";
  if (days === -1) return "Yesterday";
  if (days === 1) return "Tomorrow";
  return days > 0 ? `In ${days} days` : `${-days} days ago`;
};

const clockFormats = new Map<string, Intl.DateTimeFormat>();

/** The time of `instant` in `timeZone`: "9:41:07 PM". */
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

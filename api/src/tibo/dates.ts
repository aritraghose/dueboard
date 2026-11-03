// Calendar days as Tibo talks about them. Plain `Intl`, no Effect, so the
// AgentWorker's bundle stays small (`domain/dates.ts` has the same math with
// Schema attached). A day is a `YYYY-MM-DD` string in the user's zone.

/** The user's calendar day at `now`. */
export const dayIn = (timeZone: string, now: Date): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
};

const toUtc = (day: string) => new Date(`${day}T12:00:00Z`);

export const addDays = (day: string, days: number): string => {
  const date = toUtc(day);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** "Wednesday" */
export const weekdayOf = (day: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" }).format(toUtc(day));

/** "Today", "Tomorrow", "Yesterday", or "Fri, Nov 6" (with the year when it isn't this one). */
export const dayLabel = (day: string, today: string): string => {
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  if (day === addDays(today, -1)) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
  }).format(toUtc(day));
};

/** "3:40 PM" in the user's zone. */
export const timeIn = (instant: string | Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(instant));

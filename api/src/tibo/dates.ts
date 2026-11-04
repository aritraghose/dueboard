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

export const weekdayOf = (day: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" }).format(toUtc(day));

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

export const timeIn = (instant: string | Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(instant));

const offsetAt = (timeZone: string, instant: number) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - Math.floor(instant / 1000) * 1000;
};

export const startOfDayIn = (timeZone: string, day: string): number => instantIn(timeZone, day, "00:00");

export const instantIn = (timeZone: string, day: string, time: string): number => {
  const wallUtc = Date.parse(`${day}T${time}:00Z`);
  const guess = wallUtc - offsetAt(timeZone, wallUtc);
  return wallUtc - offsetAt(timeZone, guess);
};

import type { NotificationItem } from "@dueboard/api/rpc";
import { liveRelativeTime } from "./live.ts";

// Notifications in words.

/** What `person` did, after their name: "asked to connect". */
export const notificationAction = ({ kind }: Pick<NotificationItem, "kind">): string =>
  kind === "connection_request" ? "asked to connect" : "accepted your request";

const DAY_MS = 24 * 60 * 60 * 1000;
const days = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
const thisYear = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const otherYear = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

/** "just now", "12 min. ago", "3 hr. ago", "yesterday", "4 days ago", then "Oct 12" ("Oct 12, 2025" in another year). */
export const notificationTime = (instant: Date, now: Date): string => {
  const elapsed = now.getTime() - instant.getTime();
  if (elapsed < DAY_MS) return liveRelativeTime(instant, now);
  const ago = Math.floor(elapsed / DAY_MS);
  if (ago < 7) return days.format(-ago, "day");
  return (instant.getFullYear() === now.getFullYear() ? thisYear : otherYear).format(instant);
};

/** "3 new notifications", for screen readers next to the nav icon. */
export const unseenLabel = (count: number): string =>
  `${count} new ${count === 1 ? "notification" : "notifications"}`;

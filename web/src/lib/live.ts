import type { LiveEvent, PathEvent } from "@dueboard/api/rpc";

// Live's wording: each event is "<username> <what they did>[: <title>]".
// Redacted events (someone else's private item) come without a title. Path
// steps are the viewer's own, so they start with the verb: "Settled a task".

const minutes = (count: number) => `${count} minute${count === 1 ? "" : "s"}`;

/** What the actor did, after their name: "settled a task", "reached 40% on a goal". */
export const liveAction = ({ kind, meta }: LiveEvent): string => {
  switch (kind) {
    case "task_settled":
      return "settled a task";
    case "habit_completed":
      return "completed a habit";
    case "habit_checked":
      return meta.count !== null && meta.count > 1 ? `checked a habit ${meta.count} times` : "checked a habit";
    case "goal_progressed":
      if (meta.percent === null) return "made progress on a goal";
      return meta.rose === false ? `moved a goal back to ${meta.percent}%` : `reached ${meta.percent}% on a goal`;
    case "goal_completed":
      return "completed a goal";
    case "session_started":
      return meta.minutes === null ? "started a focus session" : `started a ${meta.minutes}-minute focus session`;
    case "session_completed":
      return meta.minutes === null ? "completed a focus session" : `completed a ${meta.minutes}-minute focus session`;
    case "session_stopped":
      if (meta.minutes === null) return "stopped a focus session";
      return meta.minutes < 1
        ? "stopped a focus session within a minute"
        : `stopped a focus session after ${minutes(meta.minutes)}`;
    case "note_created":
      return "wrote a note";
  }
};

/** A Path step: "Settled a task", "Checked a habit 3 times", "Reached 40% on a goal". */
export const pathAction = ({ kind, meta }: PathEvent): string => {
  switch (kind) {
    case "task_settled":
      return "Settled a task";
    case "habit_checked":
      return meta.count !== null && meta.count > 1 ? `Checked a habit ${meta.count} times` : "Checked a habit";
    case "goal_progressed":
      if (meta.percent === null) return "Moved a goal";
      return meta.rose === false ? `Moved a goal back to ${meta.percent}%` : `Reached ${meta.percent}% on a goal`;
    case "session_completed":
      return meta.minutes === null ? "Completed a focus session" : `Completed a ${meta.minutes}-minute focus session`;
  }
};

const relative = new Intl.RelativeTimeFormat("en-US", { numeric: "auto", style: "short" });

/** "just now", "12 min ago", "3 hr. ago": for events earlier today. */
export const liveRelativeTime = (instant: Date, now: Date): string => {
  const seconds = Math.max(0, Math.round((now.getTime() - instant.getTime()) / 1000));
  if (seconds < 45) return "just now";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return relative.format(-mins, "minute");
  return relative.format(-Math.floor(mins / 60), "hour");
};

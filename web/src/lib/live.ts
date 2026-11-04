import type { LiveEvent, PathEvent } from "@dueboard/api/rpc";

export const liveTitle = ({ kind, title }: Pick<LiveEvent, "kind" | "title">): string | null =>
  kind.startsWith("session_") ? null : title;

const minutes = (count: number) => `${count} minute${count === 1 ? "" : "s"}`;

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

export const liveRelativeTime = (instant: Date, now: Date): string => {
  const seconds = Math.max(0, Math.round((now.getTime() - instant.getTime()) / 1000));
  if (seconds < 45) return "just now";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return relative.format(-mins, "minute");
  return relative.format(-Math.floor(mins / 60), "hour");
};

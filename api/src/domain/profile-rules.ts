import type { ActivityKind, ProfileFeed } from "./model.ts";

export const FEED_KINDS: Record<ProfileFeed, readonly ActivityKind[]> = {
  tasks: ["task_settled"],
  habits: ["habit_completed"],
  goals: ["goal_completed"],
  sessions: ["session_completed"],
};

export const encodeItemCursor = (occurredAt: Date, id: string): string =>
  `${occurredAt.toISOString()}|${id}`;

export const decodeItemCursor = (cursor: string): { occurredAt: Date; id: string } | null => {
  const separator = cursor.indexOf("|");
  if (separator <= 0) return null;
  const occurredAt = new Date(cursor.slice(0, separator));
  const id = cursor.slice(separator + 1);
  if (Number.isNaN(occurredAt.getTime()) || id.length === 0) return null;
  return { occurredAt, id };
};

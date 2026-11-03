import type { ActivityKind, ProfileFeed } from "./model.ts";

// Pure rules for a profile's item tabs (`profile-items.ts`).

/**
 * The activity a profile tab lists: completed items only. Stopped sessions
 * and goal progress never show (the diary, `diary-rules.ts`, has them).
 */
export const FEED_KINDS: Record<ProfileFeed, readonly ActivityKind[]> = {
  tasks: ["task_settled"],
  habits: ["habit_completed"],
  goals: ["goal_completed"],
  sessions: ["session_completed"],
};

/** A page cursor: the last item's time and id. */
export const encodeItemCursor = (occurredAt: Date, id: string): string =>
  `${occurredAt.toISOString()}|${id}`;

/** The cursor's parts, or `null` when it's malformed. */
export const decodeItemCursor = (cursor: string): { occurredAt: Date; id: string } | null => {
  const separator = cursor.indexOf("|");
  if (separator <= 0) return null;
  const occurredAt = new Date(cursor.slice(0, separator));
  const id = cursor.slice(separator + 1);
  if (Number.isNaN(occurredAt.getTime()) || id.length === 0) return null;
  return { occurredAt, id };
};

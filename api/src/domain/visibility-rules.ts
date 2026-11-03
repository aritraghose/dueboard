import type { Privacy } from "./model.ts";

// Who may see an item, and how Live shows it (architecture.md §5), as pure
// rules. `visibility.ts` looks the relationship up and builds the same rules
// as SQL conditions; every reader of another user's items goes through it.

/**
 * How a viewer relates to an item's owner. `blocked` is either way round;
 * a logged-out viewer is `other`.
 */
export type ViewerRelation = "self" | "connected" | "other" | "blocked";

/** What the database says about a viewer and an owner. */
export interface Relationship {
  readonly connected: boolean;
  /** Either of them blocked the other. */
  readonly blocked: boolean;
}

/** How Live shows an event: with its title, or without it. */
export type LiveDisplay = "full" | "redacted";

/** The relation of `viewerId` (`null` when logged out) to `ownerId`. */
export const relationOf = (
  viewerId: string | null,
  ownerId: string,
  { connected, blocked }: Relationship,
): ViewerRelation => {
  if (viewerId === null) return "other";
  if (viewerId === ownerId) return "self";
  if (blocked) return "blocked";
  return connected ? "connected" : "other";
};

/** The privacy levels a viewer may see of the owner's items. */
export const visiblePrivacies = (relation: ViewerRelation): readonly Privacy[] => {
  switch (relation) {
    case "self":
      return ["public", "connections", "private"];
    case "connected":
      return ["public", "connections"];
    case "other":
      return ["public"];
    case "blocked":
      return [];
  }
};

/** `canSeeItem` from architecture.md §5: diaries, profiles and anything else that lists items. */
export const canSeeItem = (
  viewerId: string | null,
  ownerId: string,
  privacy: Privacy,
  relationship: Relationship,
): boolean => visiblePrivacies(relationOf(viewerId, ownerId, relationship)).includes(privacy);

/**
 * Whether an owner's event reaches the viewer's Live: only the viewer's own
 * and their connections' (never strangers', never anyone blocked either
 * way), and only items shared to Live. Logged-out visitors have no Live.
 */
export const canSeeOnLive = (
  viewerId: string | null,
  ownerId: string,
  shareToLive: boolean,
  relationship: Relationship,
): boolean => {
  if (!shareToLive) return false;
  const relation = relationOf(viewerId, ownerId, relationship);
  return relation === "self" || (viewerId !== null && relation === "connected");
};

/**
 * How an event that reaches Live (`canSeeOnLive`) is shown: private items
 * of other people lose their title ("ar1tra settled a task"); the viewer's
 * own always show in full.
 */
export const liveDisplay = (viewerId: string, ownerId: string, privacy: Privacy): LiveDisplay =>
  viewerId === ownerId || privacy !== "private" ? "full" : "redacted";

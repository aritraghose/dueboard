import type { Privacy } from "./model.ts";

export type ViewerRelation = "self" | "connected" | "other" | "blocked";

export interface Relationship {
  readonly connected: boolean;
  readonly blocked: boolean;
}

export type LiveDisplay = "full" | "redacted";

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

export const canSeeItem = (
  viewerId: string | null,
  ownerId: string,
  privacy: Privacy,
  relationship: Relationship,
): boolean => visiblePrivacies(relationOf(viewerId, ownerId, relationship)).includes(privacy);

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

export const liveDisplay = (viewerId: string, ownerId: string, privacy: Privacy): LiveDisplay =>
  viewerId === ownerId || privacy !== "private" ? "full" : "redacted";

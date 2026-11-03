import type { Privacy } from "./model.ts";

// Who may see an item (architecture.md §5), as pure rules. `visibility.ts`
// works out the relation from the database; every reader of another user's
// items goes through it.

/**
 * How a viewer relates to an item's owner. `blocked` is either way round;
 * a logged-out viewer is `other`.
 */
export type ViewerRelation = "self" | "connected" | "other" | "blocked";

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

/** `canSeeItem` from architecture.md §5. */
export const canSeeItem = (relation: ViewerRelation, privacy: Privacy): boolean =>
  visiblePrivacies(relation).includes(privacy);

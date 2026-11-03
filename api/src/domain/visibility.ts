import * as Effect from "effect/Effect";
import { areConnected, isBlocked } from "./social.ts";
import type { ViewerRelation } from "./visibility-rules.ts";

// The one place readers of other users' data learn what a viewer may see
// (planning.md working rule 9). The rules themselves are pure, in
// `visibility-rules.ts`; this module only looks up the relation.

export { canSeeItem, visiblePrivacies, type ViewerRelation } from "./visibility-rules.ts";

/** How `viewerId` (or a logged-out visitor, `null`) relates to `ownerId`. */
export const viewerRelation = Effect.fn("viewerRelation")(function* (
  viewerId: string | null,
  ownerId: string,
) {
  if (viewerId === null) return "other" as ViewerRelation;
  if (viewerId === ownerId) return "self" as ViewerRelation;
  if (yield* isBlocked(viewerId, ownerId)) return "blocked" as ViewerRelation;
  return ((yield* areConnected(viewerId, ownerId)) ? "connected" : "other") as ViewerRelation;
});

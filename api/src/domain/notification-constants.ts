// In-app notifications' plain constants (`./notifications.ts`). No imports,
// so the schema and the browser can use them without pulling in Effect.
// Re-exported by `./model.ts`, which adds their Schemas.

/**
 * What a notification tells its user: someone asked to connect
 * (`connection_request`), or someone accepted the user's request
 * (`connection_accepted`, also when they answered it by asking back).
 */
export const NOTIFICATION_KIND = ["connection_request", "connection_accepted"] as const;
export type NotificationKind = (typeof NOTIFICATION_KIND)[number];

/** How many notifications `/notifications` shows, newest first. Older ones stay stored but unlisted. */
export const NOTIFICATIONS_LIST_LIMIT = 50;

/** The unseen count stops here; the nav only shows a dot, so it never needs more. */
export const NOTIFICATIONS_UNSEEN_CAP = 99;

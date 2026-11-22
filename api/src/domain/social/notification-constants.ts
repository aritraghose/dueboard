export const NOTIFICATION_KIND = ["connection_request", "connection_accepted"] as const;
export type NotificationKind = (typeof NOTIFICATION_KIND)[number];

export const NOTIFICATIONS_LIST_LIMIT = 50;

export const NOTIFICATIONS_UNSEEN_CAP = 99;

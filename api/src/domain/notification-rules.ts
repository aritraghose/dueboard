import type { ConnectionRequestStatus } from "./model.ts";
import { CONNECTION_REQUEST_STATUS } from "./model.ts";
import type { NotificationKind } from "./notification-constants.ts";

// Which social events notify whom, and how a notification reads once its
// request has moved on. `notifications.ts` writes and reads the rows.

/** A notification to write: `actorId` did `kind` to `userId`, about `requestId`. */
export interface NotificationDraft {
  readonly userId: string;
  readonly actorId: string;
  readonly kind: NotificationKind;
  readonly requestId: string;
}

/** `fromUserId` asked `toUserId` to connect: the recipient hears of it. */
export const onRequestSent = (request: {
  readonly id: string;
  readonly fromUserId: string;
  readonly toUserId: string;
}): NotificationDraft[] =>
  request.fromUserId === request.toUserId
    ? []
    : [{ userId: request.toUserId, actorId: request.fromUserId, kind: "connection_request", requestId: request.id }];

/**
 * `acceptorId` accepted the request `requesterId` sent them (`requestId`),
 * by Accept or by asking back while it was pending: the requester hears of
 * it. The acceptor already knows, and their own request (if they had one
 * pending the other way) is answered by the same connection, so it adds
 * nothing.
 */
export const onRequestAccepted = (accepted: {
  readonly acceptorId: string;
  readonly requesterId: string;
  readonly requestId: string;
}): NotificationDraft[] =>
  accepted.acceptorId === accepted.requesterId
    ? []
    : [
        {
          userId: accepted.requesterId,
          actorId: accepted.acceptorId,
          kind: "connection_accepted",
          requestId: accepted.requestId,
        },
      ];

/**
 * Where a notification stands now, from its request's status:
 * - a request still `pending` can be answered from the notification;
 * - `accepted` and `declined` say how it was answered;
 * - a request the sender `cancelled` is hidden (`null`): they took it back,
 *   so it's as if it never came.
 * An acceptance is always `accepted`.
 */
export type NotificationState = "pending" | "accepted" | "declined";

export const notificationState = (
  kind: NotificationKind,
  requestStatus: ConnectionRequestStatus,
): NotificationState | null => {
  if (kind === "connection_accepted") return "accepted";
  switch (requestStatus) {
    case "pending":
      return "pending";
    case "accepted":
      return "accepted";
    case "declined":
      return "declined";
    case "cancelled":
      return null;
  }
};

/** Request statuses that hide a `connection_request` notification (for the SQL filter). */
export const HIDDEN_REQUEST_STATUSES: readonly ConnectionRequestStatus[] = CONNECTION_REQUEST_STATUS.filter(
  (status) => notificationState("connection_request", status) === null,
);

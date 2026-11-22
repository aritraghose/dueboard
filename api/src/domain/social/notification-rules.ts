import type { ConnectionRequestStatus } from "./model.ts";
import { CONNECTION_REQUEST_STATUS } from "./model.ts";
import type { NotificationKind } from "./notification-constants.ts";

export interface NotificationDraft {
  readonly userId: string;
  readonly actorId: string;
  readonly kind: NotificationKind;
  readonly requestId: string;
}

export const onRequestSent = (request: {
  readonly id: string;
  readonly fromUserId: string;
  readonly toUserId: string;
}): NotificationDraft[] =>
  request.fromUserId === request.toUserId
    ? []
    : [{ userId: request.toUserId, actorId: request.fromUserId, kind: "connection_request", requestId: request.id }];

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

export const HIDDEN_REQUEST_STATUSES: readonly ConnectionRequestStatus[] = CONNECTION_REQUEST_STATUS.filter(
  (status) => notificationState("connection_request", status) === null,
);

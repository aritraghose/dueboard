import { and, desc, eq, inArray, isNotNull, isNull, not, or } from "drizzle-orm";
import * as Effect from "effect/Effect";
import { ConnectionRequests, Notifications } from "../schema.ts";
import { AuthUsers } from "./auth-users.ts";
import { Database, newId, orDieOnDbError, type Executor } from "./database.ts";
import {
  NOTIFICATIONS_LIST_LIMIT,
  NOTIFICATIONS_UNSEEN_CAP,
  NotificationItem,
  NotificationsUnseen,
  Person,
} from "./model.ts";
import { HIDDEN_REQUEST_STATUSES, notificationState, type NotificationDraft } from "./notification-rules.ts";
import { notBlockedSql } from "./visibility.ts";

export const recordNotifications = (tx: Executor, drafts: readonly NotificationDraft[]) => {
  if (drafts.length === 0) return Effect.void;
  const now = new Date();
  return tx
    .insert(Notifications)
    .values(drafts.map((draft) => ({ id: newId(), ...draft, createdAt: now })))
    .onConflictDoNothing()
    .pipe(Effect.asVoid);
};

export const deleteNotificationsBetween = (tx: Executor, a: string, b: string) =>
  tx
    .delete(Notifications)
    .where(
      or(
        and(eq(Notifications.userId, a), eq(Notifications.actorId, b)),
        and(eq(Notifications.userId, b), eq(Notifications.actorId, a)),
      ),
    )
    .pipe(Effect.asVoid);

const shownTo = (userId: string) =>
  and(
    eq(Notifications.userId, userId),
    isNotNull(AuthUsers.username),
    notBlockedSql(userId, Notifications.actorId),
    not(
      and(
        eq(Notifications.kind, "connection_request"),
        inArray(ConnectionRequests.status, [...HIDDEN_REQUEST_STATUSES]),
      )!,
    ),
  );

export const listNotifications = Effect.fn("listNotifications")(function* (userId: string) {
  const db = yield* Database;
  const rows = yield* db
    .select({
      id: Notifications.id,
      kind: Notifications.kind,
      requestId: Notifications.requestId,
      requestStatus: ConnectionRequests.status,
      createdAt: Notifications.createdAt,
      seenAt: Notifications.seenAt,
      username: AuthUsers.username,
      name: AuthUsers.name,
      image: AuthUsers.image,
    })
    .from(Notifications)
    .innerJoin(AuthUsers, eq(AuthUsers.id, Notifications.actorId))
    .innerJoin(ConnectionRequests, eq(ConnectionRequests.id, Notifications.requestId))
    .where(shownTo(userId))
    .orderBy(desc(Notifications.createdAt), desc(Notifications.id))
    .limit(NOTIFICATIONS_LIST_LIMIT)
    .pipe(orDieOnDbError);
  return rows.flatMap((row) => {
    const state = notificationState(row.kind, row.requestStatus);
    if (state === null) return [];
    return [
      new NotificationItem({
        id: row.id,
        kind: row.kind,
        person: new Person({ username: row.username ?? "", name: row.name, image: row.image }),
        requestId: row.requestId,
        state,
        seen: row.seenAt !== null,
        createdAt: row.createdAt,
      }),
    ];
  });
});

export const countUnseenNotifications = Effect.fn("countUnseenNotifications")(function* (userId: string) {
  const db = yield* Database;
  const rows = yield* db
    .select({ id: Notifications.id })
    .from(Notifications)
    .innerJoin(AuthUsers, eq(AuthUsers.id, Notifications.actorId))
    .innerJoin(ConnectionRequests, eq(ConnectionRequests.id, Notifications.requestId))
    .where(and(shownTo(userId), isNull(Notifications.seenAt)))
    .limit(NOTIFICATIONS_UNSEEN_CAP)
    .pipe(orDieOnDbError);
  return new NotificationsUnseen({ count: rows.length });
});

export const markNotificationsSeen = Effect.fn("markNotificationsSeen")(function* (userId: string) {
  const db = yield* Database;
  yield* db
    .update(Notifications)
    .set({ seenAt: new Date() })
    .where(and(eq(Notifications.userId, userId), isNull(Notifications.seenAt)))
    .pipe(orDieOnDbError);
});

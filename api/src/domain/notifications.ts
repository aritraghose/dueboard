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

// In-app notifications: someone asked the user to connect, or accepted
// their request. `social.ts` writes them in the request's or the accept's
// own transaction (which events notify whom is `notification-rules.ts`);
// `/notifications` lists them and the nav shows a dot while any is unseen.
// A block deletes them both ways, and reads leave out anyone blocked too.

// ─── Writes, in the caller's transaction ─────────────────────────────────────

/** Writes `drafts`; one per request and kind, so writing one again is a no-op. */
export const recordNotifications = (tx: Executor, drafts: readonly NotificationDraft[]) => {
  if (drafts.length === 0) return Effect.void;
  const now = new Date();
  return tx
    .insert(Notifications)
    .values(drafts.map((draft) => ({ id: newId(), ...draft, createdAt: now })))
    .onConflictDoNothing()
    .pipe(Effect.asVoid);
};

/** Deletes every notification between `a` and `b`, both ways (a block). */
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

// ─── Reads ───────────────────────────────────────────────────────────────────

/**
 * The user's notifications that still show: from someone with a username
 * whom neither side blocked, leaving out requests the sender took back.
 * Queries using it join `AuthUsers` on the actor and `ConnectionRequests`
 * on the request.
 */
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

/** `/notifications`: the newest `NOTIFICATIONS_LIST_LIMIT`, newest first. */
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

/** How many shown notifications the user hasn't seen, up to `NOTIFICATIONS_UNSEEN_CAP`. */
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

/** Marks all the user's notifications seen (opening `/notifications`). */
export const markNotificationsSeen = Effect.fn("markNotificationsSeen")(function* (userId: string) {
  const db = yield* Database;
  yield* db
    .update(Notifications)
    .set({ seenAt: new Date() })
    .where(and(eq(Notifications.userId, userId), isNull(Notifications.seenAt)))
    .pipe(orDieOnDbError);
});

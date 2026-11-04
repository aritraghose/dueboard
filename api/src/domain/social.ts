import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  ilike,
  like,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import * as Effect from "effect/Effect";
import { Activity, AskSettingsTable, Blocks, ConnectionRequests, Connections, UserSettings } from "../schema.ts";
import { AuthUsers } from "./auth-users.ts";
import { Database, newId, orDieOnDbError, transaction, type Executor } from "./database.ts";
import {
  BlockedPerson,
  CONNECTION_REQUESTS_PER_DAY,
  Connection,
  ConnectionNotAllowed,
  ConnectionRequest,
  ConnectionRequestNotFound,
  ConnectionRequestRef,
  PEOPLE_SEARCH_LIMIT,
  Person,
  PersonResult,
  Profile,
  ProfileCounts,
  SearchPeopleInput,
  SocialLimitReached,
  SocialOverview,
  SocialStatus,
  UserNotFound,
  UsernameRef,
  decodeInput,
  type ConnectionState,
} from "./model.ts";
import { deleteAskQuestionsBetween } from "./ask.ts";
import { RateLimiter } from "./rate-limiter.ts";
import {
  connectionState,
  normalizeUsername,
  orderedPair,
  searchPatterns,
} from "./social-rules.ts";
import { pointsOf } from "./points.ts";
import { cancelRelaysBetween } from "./relays.ts";
import { onRequestAccepted, onRequestSent } from "./notification-rules.ts";
import { deleteNotificationsBetween, recordNotifications } from "./notifications.ts";

// Connections, connection requests and blocks (planning.md "Connections",
// architecture.md §4), people search and the public profile read. Pair
// writes take a transaction-scoped advisory lock on the pair, so two users
// requesting each other at once (or a block racing an accept) apply one
// after the other. `areConnected` and `isBlocked` are the reads
// `visibility.ts` builds on (step 14).

const DAY_MS = 24 * 60 * 60 * 1000;

const personColumns = {
  id: AuthUsers.id,
  username: AuthUsers.username,
  name: AuthUsers.name,
  image: AuthUsers.image,
  createdAt: AuthUsers.createdAt,
};

type UserRow = {
  readonly id: string;
  readonly username: string | null;
  readonly name: string;
  readonly image: string | null;
};

const toPerson = (row: UserRow) =>
  new Person({ username: row.username ?? "", name: row.name, image: row.image });

const status = (state: ConnectionState, requestId: string | null = null) =>
  new SocialStatus({ state, requestId });

const userNotFound = (username: string) =>
  new UserNotFound({ message: `There's no one called @${username.replace(/^@/, "")}.`, username });

const requestNotFound = (id: string) =>
  new ConnectionRequestNotFound({ message: "That request isn't pending any more.", id });

/** An onboarded user by typed username (`@` and case don't matter), or `UserNotFound`. */
const findUser = (tx: Executor, input: string) =>
  Effect.gen(function* () {
    const username = normalizeUsername(input);
    if (!username) return yield* userNotFound(input);
    const [row] = yield* tx.select(personColumns).from(AuthUsers).where(eq(AuthUsers.username, username));
    if (!row) return yield* userNotFound(input);
    return row;
  });

/** Serializes writes to one pair until the transaction ends. */
const lockPair = (tx: Executor, a: string, b: string) => {
  const [low, high] = orderedPair(a, b);
  return tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`social:${low}:${high}`}))`);
};

/** Whether `viewerId` blocked `otherId`, and whether `otherId` blocked `viewerId`. */
const blocksBetween = (tx: Executor, viewerId: string, otherId: string) =>
  Effect.gen(function* () {
    const rows = yield* tx
      .select({ blockerId: Blocks.blockerId })
      .from(Blocks)
      .where(
        or(
          and(eq(Blocks.blockerId, viewerId), eq(Blocks.blockedId, otherId)),
          and(eq(Blocks.blockerId, otherId), eq(Blocks.blockedId, viewerId)),
        ),
      );
    return {
      viewerBlocked: rows.some((row) => row.blockerId === viewerId),
      blockedViewer: rows.some((row) => row.blockerId === otherId),
    };
  });

const connectionBetween = (a: string, b: string) => {
  const [low, high] = orderedPair(a, b);
  return and(eq(Connections.userLow, low), eq(Connections.userHigh, high));
};

/** Adds the pair's connection; a second add is a no-op. */
const connect = (tx: Executor, a: string, b: string, now: Date) => {
  const [userLow, userHigh] = orderedPair(a, b);
  return tx.insert(Connections).values({ userLow, userHigh, createdAt: now }).onConflictDoNothing();
};

/**
 * The viewer's status with each of `otherIds`, in a fixed number of
 * queries. Callers have already left out anyone who blocked the viewer.
 */
const statusesFor = (tx: Executor, viewerId: string, otherIds: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const result = new Map<string, SocialStatus>();
    if (otherIds.length === 0) return result;
    const ids = [...otherIds];
    const [blocked, connected, pending] = yield* Effect.all(
      [
        tx
          .select({ id: Blocks.blockedId })
          .from(Blocks)
          .where(and(eq(Blocks.blockerId, viewerId), inArray(Blocks.blockedId, ids))),
        tx
          .select({ low: Connections.userLow, high: Connections.userHigh })
          .from(Connections)
          .where(
            or(
              and(eq(Connections.userLow, viewerId), inArray(Connections.userHigh, ids)),
              and(eq(Connections.userHigh, viewerId), inArray(Connections.userLow, ids)),
            ),
          ),
        tx
          .select({
            id: ConnectionRequests.id,
            from: ConnectionRequests.fromUserId,
            to: ConnectionRequests.toUserId,
          })
          .from(ConnectionRequests)
          .where(
            and(
              eq(ConnectionRequests.status, "pending"),
              or(
                and(eq(ConnectionRequests.fromUserId, viewerId), inArray(ConnectionRequests.toUserId, ids)),
                and(eq(ConnectionRequests.toUserId, viewerId), inArray(ConnectionRequests.fromUserId, ids)),
              ),
            ),
          ),
      ],
      { concurrency: 1 },
    );
    const blockedIds = new Set(blocked.map((row) => row.id));
    const connectedIds = new Set(connected.map((row) => (row.low === viewerId ? row.high : row.low)));
    for (const id of ids) {
      const outgoing = pending.find((row) => row.from === viewerId && row.to === id);
      const incoming = pending.find((row) => row.to === viewerId && row.from === id);
      const state = connectionState({
        self: id === viewerId,
        viewerBlocked: blockedIds.has(id),
        connected: connectedIds.has(id),
        pendingOut: outgoing !== undefined,
        pendingIn: incoming !== undefined,
      });
      const requestId =
        state === "pending_in" ? incoming!.id : state === "pending_out" ? outgoing!.id : null;
      result.set(id, status(state, requestId));
    }
    return result;
  });

// ─── Reads other services use ────────────────────────────────────────────────

/** Whether `a` and `b` are connected. */
export const areConnected = Effect.fn("areConnected")(function* (a: string, b: string) {
  if (a === b) return false;
  const db = yield* Database;
  const [row] = yield* db
    .select({ low: Connections.userLow })
    .from(Connections)
    .where(connectionBetween(a, b))
    .pipe(orDieOnDbError);
  return row !== undefined;
});

/** Whether either of `a` and `b` blocked the other. */
export const isBlocked = Effect.fn("isBlocked")(function* (a: string, b: string) {
  if (a === b) return false;
  const db = yield* Database;
  const { viewerBlocked, blockedViewer } = yield* blocksBetween(db, a, b).pipe(orDieOnDbError);
  return viewerBlocked || blockedViewer;
});

// ─── Requests ────────────────────────────────────────────────────────────────

/**
 * Asks `username` to connect, and notifies them. If they already asked the
 * user, both requests are accepted, the two are connected at once, and
 * they're notified of the accept instead. Refused for yourself,
 * someone you blocked, or someone you're connected to; someone who blocked
 * you looks like no one (`UserNotFound`). Sending again while a request is
 * pending returns it. Limited to a burst per minute and
 * `CONNECTION_REQUESTS_PER_DAY` in any 24 hours.
 */
export const sendConnectionRequest = Effect.fn("sendConnectionRequest")(function* (
  userId: string,
  input: UsernameRef,
) {
  const { username } = yield* decodeInput(UsernameRef)(input);
  const limiter = yield* RateLimiter;
  if (!(yield* limiter.allow("connectionRequest", userId))) {
    return yield* new SocialLimitReached({
      message: "You're sending requests quickly. Wait a minute and try again.",
    });
  }
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const target = yield* findUser(tx, username);
      if (target.id === userId) {
        return yield* new ConnectionNotAllowed({ message: "That's you.", reason: "self" });
      }
      yield* lockPair(tx, userId, target.id);
      const blocks = yield* blocksBetween(tx, userId, target.id);
      if (blocks.blockedViewer) return yield* userNotFound(username);
      if (blocks.viewerBlocked) {
        return yield* new ConnectionNotAllowed({
          message: `Unblock @${target.username} to connect.`,
          reason: "blocked",
        });
      }
      const [connected] = yield* tx
        .select({ low: Connections.userLow })
        .from(Connections)
        .where(connectionBetween(userId, target.id));
      if (connected) {
        return yield* new ConnectionNotAllowed({
          message: `You're already connected with @${target.username}.`,
          reason: "already_connected",
        });
      }
      const pending = yield* tx
        .select()
        .from(ConnectionRequests)
        .where(
          and(
            eq(ConnectionRequests.status, "pending"),
            or(
              and(eq(ConnectionRequests.fromUserId, userId), eq(ConnectionRequests.toUserId, target.id)),
              and(eq(ConnectionRequests.fromUserId, target.id), eq(ConnectionRequests.toUserId, userId)),
            ),
          ),
        );
      const now = new Date();
      const theirs = pending.find((row) => row.fromUserId === target.id);
      if (theirs) {
        // They asked first: this request is the answer.
        yield* tx
          .update(ConnectionRequests)
          .set({ status: "accepted", respondedAt: now })
          .where(inArray(ConnectionRequests.id, pending.map((row) => row.id)));
        yield* connect(tx, userId, target.id, now);
        yield* recordNotifications(
          tx,
          onRequestAccepted({ acceptorId: userId, requesterId: target.id, requestId: theirs.id }),
        );
        return status("connected");
      }
      const outgoing = pending.find((row) => row.fromUserId === userId);
      if (outgoing) return status("pending_out", outgoing.id);
      const [{ sent } = { sent: 0 }] = yield* tx
        .select({ sent: count() })
        .from(ConnectionRequests)
        .where(
          and(
            eq(ConnectionRequests.fromUserId, userId),
            gte(ConnectionRequests.createdAt, new Date(now.getTime() - DAY_MS)),
          ),
        );
      if (sent >= CONNECTION_REQUESTS_PER_DAY) {
        return yield* new SocialLimitReached({
          message: `You can send up to ${CONNECTION_REQUESTS_PER_DAY} requests a day. Try again tomorrow.`,
        });
      }
      const id = newId();
      yield* tx
        .insert(ConnectionRequests)
        .values({ id, fromUserId: userId, toUserId: target.id, createdAt: now });
      yield* recordNotifications(tx, onRequestSent({ id, fromUserId: userId, toUserId: target.id }));
      return status("pending_out", id);
    }),
  );
});

/**
 * Accepts a pending request to the user (and their own pending one the
 * other way), and notifies the sender.
 */
export const acceptConnectionRequest = Effect.fn("acceptConnectionRequest")(function* (
  userId: string,
  input: ConnectionRequestRef,
) {
  const { requestId } = yield* decodeInput(ConnectionRequestRef)(input);
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const incoming = and(
        eq(ConnectionRequests.id, requestId),
        eq(ConnectionRequests.toUserId, userId),
        eq(ConnectionRequests.status, "pending"),
      );
      const [found] = yield* tx
        .select({ fromUserId: ConnectionRequests.fromUserId })
        .from(ConnectionRequests)
        .where(incoming);
      if (!found) return yield* requestNotFound(requestId);
      // Lock the pair before re-reading, the order every pair write uses.
      yield* lockPair(tx, userId, found.fromUserId);
      const blocks = yield* blocksBetween(tx, userId, found.fromUserId);
      if (blocks.viewerBlocked || blocks.blockedViewer) return yield* requestNotFound(requestId);
      const now = new Date();
      const accepted = yield* tx
        .update(ConnectionRequests)
        .set({ status: "accepted", respondedAt: now })
        .where(
          and(
            eq(ConnectionRequests.status, "pending"),
            or(
              and(eq(ConnectionRequests.id, requestId), eq(ConnectionRequests.toUserId, userId)),
              and(
                eq(ConnectionRequests.fromUserId, userId),
                eq(ConnectionRequests.toUserId, found.fromUserId),
              ),
            ),
          ),
        )
        .returning({ id: ConnectionRequests.id });
      if (!accepted.some((row) => row.id === requestId)) return yield* requestNotFound(requestId);
      yield* connect(tx, userId, found.fromUserId, now);
      yield* recordNotifications(
        tx,
        onRequestAccepted({ acceptorId: userId, requesterId: found.fromUserId, requestId }),
      );
      return status("connected");
    }),
  );
});

/** Declines a pending request to the user. The sender isn't told; they see no request. */
export const declineConnectionRequest = Effect.fn("declineConnectionRequest")(function* (
  userId: string,
  input: ConnectionRequestRef,
) {
  const { requestId } = yield* decodeInput(ConnectionRequestRef)(input);
  const db = yield* Database;
  const rows = yield* db
    .update(ConnectionRequests)
    .set({ status: "declined", respondedAt: new Date() })
    .where(
      and(
        eq(ConnectionRequests.id, requestId),
        eq(ConnectionRequests.toUserId, userId),
        eq(ConnectionRequests.status, "pending"),
      ),
    )
    .returning({ id: ConnectionRequests.id })
    .pipe(orDieOnDbError);
  if (rows.length === 0) return yield* requestNotFound(requestId);
  return status("none");
});

/** Takes back a pending request the user sent. */
export const cancelConnectionRequest = Effect.fn("cancelConnectionRequest")(function* (
  userId: string,
  input: ConnectionRequestRef,
) {
  const { requestId } = yield* decodeInput(ConnectionRequestRef)(input);
  const db = yield* Database;
  const rows = yield* db
    .update(ConnectionRequests)
    .set({ status: "cancelled", respondedAt: new Date() })
    .where(
      and(
        eq(ConnectionRequests.id, requestId),
        eq(ConnectionRequests.fromUserId, userId),
        eq(ConnectionRequests.status, "pending"),
      ),
    )
    .returning({ id: ConnectionRequests.id })
    .pipe(orDieOnDbError);
  if (rows.length === 0) return yield* requestNotFound(requestId);
  return status("none");
});

// ─── Connections and blocks ──────────────────────────────────────────────────

/** Removes the connection with `username`, if there is one. */
export const removeConnection = Effect.fn("removeConnection")(function* (
  userId: string,
  input: UsernameRef,
) {
  const { username } = yield* decodeInput(UsernameRef)(input);
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const target = yield* findUser(tx, username);
      yield* lockPair(tx, userId, target.id);
      yield* tx.delete(Connections).where(connectionBetween(userId, target.id));
      return status(target.id === userId ? "self" : "none");
    }),
  );
});

/**
 * Blocks `username`: removes the connection, closes pending requests both
 * ways (the user's own are cancelled, theirs declined), cancels open relays
 * both ways, deletes notifications between them, and hides each from the
 * other from now on. Blocking twice is a no-op.
 */
export const blockUser = Effect.fn("blockUser")(function* (userId: string, input: UsernameRef) {
  const { username } = yield* decodeInput(UsernameRef)(input);
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const target = yield* findUser(tx, username);
      if (target.id === userId) {
        return yield* new ConnectionNotAllowed({ message: "You can't block yourself.", reason: "self" });
      }
      yield* lockPair(tx, userId, target.id);
      const now = new Date();
      yield* tx
        .insert(Blocks)
        .values({ blockerId: userId, blockedId: target.id, createdAt: now })
        .onConflictDoNothing();
      yield* tx.delete(Connections).where(connectionBetween(userId, target.id));
      yield* tx
        .update(ConnectionRequests)
        .set({ status: "cancelled", respondedAt: now })
        .where(
          and(
            eq(ConnectionRequests.status, "pending"),
            eq(ConnectionRequests.fromUserId, userId),
            eq(ConnectionRequests.toUserId, target.id),
          ),
        );
      yield* tx
        .update(ConnectionRequests)
        .set({ status: "declined", respondedAt: now })
        .where(
          and(
            eq(ConnectionRequests.status, "pending"),
            eq(ConnectionRequests.fromUserId, target.id),
            eq(ConnectionRequests.toUserId, userId),
          ),
        );
      // Open relays both ways close too (step 21).
      yield* cancelRelaysBetween(tx, userId, target.id);
      // Notifications between them go both ways, for good.
      yield* deleteNotificationsBetween(tx, userId, target.id);
      // So do the Ask page questions they asked each other (step 22).
      yield* deleteAskQuestionsBetween(tx, userId, target.id);
      return status("blocked");
    }),
  );
});

/** Lifts the user's block on `username`. Nothing else comes back: they start unconnected. */
export const unblockUser = Effect.fn("unblockUser")(function* (userId: string, input: UsernameRef) {
  const { username } = yield* decodeInput(UsernameRef)(input);
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const target = yield* findUser(tx, username);
      yield* tx
        .delete(Blocks)
        .where(and(eq(Blocks.blockerId, userId), eq(Blocks.blockedId, target.id)));
      return status(target.id === userId ? "self" : "none");
    }),
  );
});

// ─── Lists ───────────────────────────────────────────────────────────────────

/** The user's connections, newest first. */
export const listConnections = Effect.fn("listConnections")(function* (userId: string) {
  const db = yield* Database;
  const rows = yield* db
    .select({ ...personColumns, since: Connections.createdAt })
    .from(Connections)
    .innerJoin(
      AuthUsers,
      or(
        and(eq(Connections.userLow, userId), eq(AuthUsers.id, Connections.userHigh)),
        and(eq(Connections.userHigh, userId), eq(AuthUsers.id, Connections.userLow)),
      ),
    )
    .where(isNotNull(AuthUsers.username))
    .orderBy(desc(Connections.createdAt), asc(AuthUsers.username))
    .pipe(orDieOnDbError);
  return rows.map((row) => new Connection({ person: toPerson(row), since: row.since }));
});

/** Pending requests other users sent to the user, newest first. */
export const listIncomingRequests = Effect.fn("listIncomingRequests")(function* (userId: string) {
  const db = yield* Database;
  const rows = yield* db
    .select({ ...personColumns, requestId: ConnectionRequests.id, sentAt: ConnectionRequests.createdAt })
    .from(ConnectionRequests)
    .innerJoin(AuthUsers, eq(AuthUsers.id, ConnectionRequests.fromUserId))
    .where(
      and(
        eq(ConnectionRequests.toUserId, userId),
        eq(ConnectionRequests.status, "pending"),
        isNotNull(AuthUsers.username),
      ),
    )
    .orderBy(desc(ConnectionRequests.createdAt))
    .pipe(orDieOnDbError);
  return rows.map(
    (row) => new ConnectionRequest({ id: row.requestId, person: toPerson(row), createdAt: row.sentAt }),
  );
});

/** Pending requests the user sent, newest first. */
export const listOutgoingRequests = Effect.fn("listOutgoingRequests")(function* (userId: string) {
  const db = yield* Database;
  const rows = yield* db
    .select({ ...personColumns, requestId: ConnectionRequests.id, sentAt: ConnectionRequests.createdAt })
    .from(ConnectionRequests)
    .innerJoin(AuthUsers, eq(AuthUsers.id, ConnectionRequests.toUserId))
    .where(
      and(
        eq(ConnectionRequests.fromUserId, userId),
        eq(ConnectionRequests.status, "pending"),
        isNotNull(AuthUsers.username),
      ),
    )
    .orderBy(desc(ConnectionRequests.createdAt))
    .pipe(orDieOnDbError);
  return rows.map(
    (row) => new ConnectionRequest({ id: row.requestId, person: toPerson(row), createdAt: row.sentAt }),
  );
});

/** The people the user blocked, newest first. */
export const listBlocked = Effect.fn("listBlocked")(function* (userId: string) {
  const db = yield* Database;
  const rows = yield* db
    .select({ ...personColumns, since: Blocks.createdAt })
    .from(Blocks)
    .innerJoin(AuthUsers, eq(AuthUsers.id, Blocks.blockedId))
    .where(and(eq(Blocks.blockerId, userId), isNotNull(AuthUsers.username)))
    .orderBy(desc(Blocks.createdAt))
    .pipe(orDieOnDbError);
  return rows.map((row) => new BlockedPerson({ person: toPerson(row), since: row.since }));
});

/** Settings' Connections tab in one call. */
export const getSocialOverview = Effect.fn("getSocialOverview")(function* (userId: string) {
  const lists = yield* Effect.all(
    {
      connections: listConnections(userId),
      incoming: listIncomingRequests(userId),
      outgoing: listOutgoingRequests(userId),
      blocked: listBlocked(userId),
    },
    { concurrency: "unbounded" },
  );
  return new SocialOverview(lists);
});

// ─── People and profiles ─────────────────────────────────────────────────────

/**
 * Finds people by username (exact, or how it starts) or by name (any part,
 * ignoring case), at least two characters; the exact username first, then
 * other username matches, then name matches, alphabetical within each; at
 * most `PEOPLE_SEARCH_LIMIT`. The user can find themselves (`self`);
 * anyone who blocked them is left out. Rate limited per user.
 */
export const searchPeople = Effect.fn("searchPeople")(function* (
  userId: string,
  input: SearchPeopleInput,
) {
  const { query } = yield* decodeInput(SearchPeopleInput)(input);
  const patterns = searchPatterns(query);
  if (!patterns) return [];
  const limiter = yield* RateLimiter;
  if (!(yield* limiter.allow("peopleSearch", userId))) {
    return yield* new SocialLimitReached({
      message: "You're searching quickly. Wait a minute and try again.",
    });
  }
  const db = yield* Database;
  const usernameMatch = patterns.username ? like(AuthUsers.username, patterns.username) : undefined;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const rows = yield* tx
        .select(personColumns)
        .from(AuthUsers)
        .where(
          and(
            isNotNull(AuthUsers.username),
            or(usernameMatch, ilike(AuthUsers.name, patterns.name)),
            notExists(
              tx
                .select({ one: sql`1` })
                .from(Blocks)
                .where(and(eq(Blocks.blockerId, AuthUsers.id), eq(Blocks.blockedId, userId))),
            ),
          ),
        )
        .orderBy(
          desc(sql`${AuthUsers.username} = ${patterns.exact}`),
          // Without a username pattern only names can match, so there's nothing to rank by.
          ...(usernameMatch ? [desc(usernameMatch)] : []),
          asc(AuthUsers.username),
        )
        .limit(PEOPLE_SEARCH_LIMIT);
      const statuses = yield* statusesFor(
        tx,
        userId,
        rows.map((row) => row.id),
      );
      return rows.map(
        (row) => new PersonResult({ person: toPerson(row), status: statuses.get(row.id)! }),
      );
    }),
  );
});

/** All-time public totals for a profile. */
const profileCounts = (tx: Executor, ownerId: string) =>
  Effect.gen(function* () {
    const [connections] = yield* tx
      .select({ total: count() })
      .from(Connections)
      .where(or(eq(Connections.userLow, ownerId), eq(Connections.userHigh, ownerId)));
    const kinds = yield* tx
      .select({ kind: Activity.kind, total: count() })
      .from(Activity)
      .where(
        and(
          eq(Activity.userId, ownerId),
          inArray(Activity.kind, [
            "task_settled",
            "habit_completed",
            "goal_completed",
            "session_completed",
          ]),
        ),
      )
      .groupBy(Activity.kind);
    const of = (kind: string) => kinds.find((row) => row.kind === kind)?.total ?? 0;
    return new ProfileCounts({
      connections: connections?.total ?? 0,
      points: yield* pointsOf(tx, ownerId),
      tasksSettled: of("task_settled"),
      habitsCompleted: of("habit_completed"),
      goalsCompleted: of("goal_completed"),
      sessionsCompleted: of("session_completed"),
    });
  });

/**
 * `/@username` for any viewer, signed in (`viewerId`) or not (`null`):
 * the card, the viewer's status with them and public counts. Someone who
 * blocked the viewer, like a username nobody has, is `UserNotFound`; a
 * viewer who blocked them gets the card without counts, to unblock from.
 */
export const getProfile = Effect.fn("getProfile")(function* (
  viewerId: string | null,
  input: UsernameRef,
) {
  const { username } = yield* decodeInput(UsernameRef)(input);
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const owner = yield* findUser(tx, username);
      let social = status("none");
      if (viewerId) {
        const blocks = yield* blocksBetween(tx, viewerId, owner.id);
        if (blocks.blockedViewer) return yield* userNotFound(username);
        social = (yield* statusesFor(tx, viewerId, [owner.id])).get(owner.id)!;
      }
      const [settings] = yield* tx
        .select({ color: UserSettings.color })
        .from(UserSettings)
        .where(eq(UserSettings.userId, owner.id));
      const [ask] = yield* tx
        .select({ enabled: AskSettingsTable.enabled })
        .from(AskSettingsTable)
        .where(eq(AskSettingsTable.userId, owner.id));
      return new Profile({
        person: toPerson(owner),
        joinedAt: owner.createdAt,
        color: settings?.color ?? null,
        status: social,
        counts: social.state === "blocked" ? null : yield* profileCounts(tx, owner.id),
        // A block either way closes the Ask page (`domain/ask.ts`); the owner can always preview theirs.
        askEnabled: social.state === "self" || (social.state !== "blocked" && (ask?.enabled ?? false)),
      });
    }),
  );
});

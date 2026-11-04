import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import * as Effect from "effect/Effect";
import { Blocks, Connections, Relays, UserSettings, type RelayRow } from "../schema.ts";
import { AuthUsers } from "./auth-users.ts";
import { Database, newId, orDieOnDbError, transaction, type Executor } from "./database.ts";
import {
  Id,
  RELAY_OPEN_STATUS,
  RELAY_UNITS_PER_SIDE,
  RelayClosed,
  RelayLimitReached,
  RelayNotAllowed,
  RelayNotFound,
  RelayRecipient,
  RelayRecipientUnclear,
  RelayText,
  SendRelayInput,
  UserNotFound,
  decodeInput,
  type RelayStatus,
} from "./model.ts";
import { RateLimiter } from "./rate-limiter.ts";
import {
  expiresAtFor,
  isOpen,
  refusalMessage,
  relayCapMessage,
  relayDecision,
  syncAfter,
} from "./relay-rules.ts";
import { normalizeUsername } from "./social-rules.ts";
import { canSpend } from "./usage.ts";

// Tibo relays (architecture.md §7.5): a message one user's Tibo passes to
// another user through theirs, and the answer back. Only the AgentWorker
// calls these, through the DomainWorker (`../DomainWorker.ts`), with the
// acting user's id first; a relay is only ever read or changed by its sender
// or its recipient.
//
// The domain keeps the truth (status, answer, timestamps); each side's
// `TiboAgent` shows the relay as a card and tells its user when it changes.
// `sender_synced`/`recipient_synced` track whether each side has caught up,
// and `sweepRelays` (every minute, from the AgentWorker's cron) expires old
// relays and hands back the ones an agent still has to hear about.

const DAY_MS = 24 * 60 * 60_000;
/** A held delivery (someone's out of quota) is tried again this much later. */
const HOLD_RETRY_MS = 30 * 60_000;
/** The sweep leaves a change this long to the direct path between agents. */
const SWEEP_GRACE_MS = 20_000;
/** Between the sweep's tries for one relay. */
const SWEEP_RETRY_MS = 5 * 60_000;
/** The most relays one sweep hands out. */
export const RELAY_SWEEP_BATCH = 100;
/** The most relays `listRelays` returns. */
const LIST_LIMIT = 20;

/** The other side of a relay, as the acting user sees it. */
export interface RelayPersonJson {
  /** Their user id: for the agent to reach their Tibo, never shown to the model. */
  readonly userId: string;
  readonly username: string;
  readonly name: string;
}

/** A relay from one side's point of view, as plain JSON. */
export interface RelayJson {
  readonly id: string;
  /** `out`: the acting user sent it; `in`: it's for them. */
  readonly direction: "in" | "out";
  readonly person: RelayPersonJson;
  readonly message: string;
  readonly status: RelayStatus;
  readonly answer: string | null;
  readonly createdAt: string;
  readonly deliveredAt: string | null;
  readonly answeredAt: string | null;
  readonly expiresAt: string;
}

/** A relay one side's agent still has to hear about (`sweepRelays`). */
export interface RelaySyncJson {
  readonly id: string;
  readonly fromUserId: string;
  readonly toUserId: string;
  readonly senderSynced: boolean;
  readonly recipientSynced: boolean;
}

const personColumns = { id: AuthUsers.id, username: AuthUsers.username, name: AuthUsers.name };
type PersonRow = { readonly id: string; readonly username: string | null; readonly name: string };

const iso = (date: Date | null) => (date ? date.toISOString() : null);

const toJson = (row: RelayRow, actorId: string, person: PersonRow): RelayJson => ({
  id: row.id,
  direction: row.fromUserId === actorId ? "out" : "in",
  person: { userId: person.id, username: person.username ?? "", name: person.name },
  message: row.message,
  status: row.status,
  answer: row.answer,
  createdAt: row.createdAt.toISOString(),
  deliveredAt: iso(row.deliveredAt),
  answeredAt: iso(row.answeredAt),
  expiresAt: row.expiresAt.toISOString(),
});

const notFound = (id: string) =>
  new RelayNotFound({ message: "No message through Tibo has that id. List them to find it.", id });

const noOne = (input: string) =>
  new UserNotFound({
    message: `There's no one called @${input.trim().replace(/^@/, "")}. Ask the user for their username.`,
    username: input,
  });

const openStatuses = [...RELAY_OPEN_STATUS];

/** Serializes relay writes for these users (the caps) until the transaction ends. */
const lockUsers = (tx: Executor, ...userIds: string[]) =>
  Effect.forEach(
    [...new Set(userIds)].sort(),
    (userId) => tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`relay:${userId}`}))`),
    { discard: true },
  );

/**
 * Who a relay is for. A username (`@` optional) first; failing that, when
 * `byName`, one of the sender's connections whose name matches (several
 * matches ask the user which one). Someone without a username yet can't be
 * found.
 */
const resolveRecipient = (tx: Executor, fromUserId: string, input: string, byName: boolean) =>
  Effect.gen(function* () {
    const username = normalizeUsername(input);
    if (username) {
      const [row] = yield* tx.select(personColumns).from(AuthUsers).where(eq(AuthUsers.username, username));
      if (row) return row;
    }
    const name = input.trim().replace(/^@/, "").replace(/\s+/g, " ");
    if (!byName || name.length < 2) return yield* noOne(input);
    const rows = yield* tx
      .select(personColumns)
      .from(AuthUsers)
      .innerJoin(
        Connections,
        or(
          and(eq(Connections.userLow, fromUserId), eq(Connections.userHigh, AuthUsers.id)),
          and(eq(Connections.userHigh, fromUserId), eq(Connections.userLow, AuthUsers.id)),
        ),
      )
      .where(and(isNotNull(AuthUsers.username), ilike(AuthUsers.name, `%${name.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)))
      .orderBy(asc(AuthUsers.name))
      .limit(6);
    if (rows.length === 1) return rows[0]!;
    if (rows.length > 1) {
      return yield* new RelayRecipientUnclear({
        message: `Several of the user's connections match “${name}”. Ask which one they mean.`,
        candidates: rows.map((row) => ({ username: row.username ?? "", name: row.name })),
      });
    }
    return yield* noOne(input);
  });

/**
 * Every rule a new relay from `fromUserId` to `target` must pass: blocks,
 * the recipient's policy, the caps and both quotas. Fails with the reason.
 */
const vet = (tx: Executor, fromUserId: string, target: PersonRow & { username: string }) =>
  Effect.gen(function* () {
    const [blocks, [settings], [connected]] = yield* Effect.all([
      tx
        .select({ blockerId: Blocks.blockerId })
        .from(Blocks)
        .where(
          or(
            and(eq(Blocks.blockerId, fromUserId), eq(Blocks.blockedId, target.id)),
            and(eq(Blocks.blockerId, target.id), eq(Blocks.blockedId, fromUserId)),
          ),
        ),
      tx.select({ policy: UserSettings.relayPolicy }).from(UserSettings).where(eq(UserSettings.userId, target.id)),
      tx
        .select({ low: Connections.userLow })
        .from(Connections)
        .where(
          or(
            and(eq(Connections.userLow, fromUserId), eq(Connections.userHigh, target.id)),
            and(eq(Connections.userHigh, fromUserId), eq(Connections.userLow, target.id)),
          ),
        ),
    ]);
    const decision = relayDecision({
      self: target.id === fromUserId,
      senderBlocked: blocks.some((row) => row.blockerId === fromUserId),
      recipientBlocked: blocks.some((row) => row.blockerId === target.id),
      // No settings row yet: the column's default.
      policy: settings?.policy ?? "connections",
      connected: connected !== undefined,
    });
    if (decision === "not_found") return yield* noOne(target.username);
    if (decision) {
      return yield* new RelayNotAllowed({ message: refusalMessage(decision, target.username), reason: decision });
    }

    const now = Date.now();
    const [[sent], [toPair], [forRecipient]] = yield* Effect.all([
      tx
        .select({ n: count() })
        .from(Relays)
        .where(and(eq(Relays.fromUserId, fromUserId), gte(Relays.createdAt, new Date(now - DAY_MS)))),
      tx
        .select({ n: count() })
        .from(Relays)
        .where(
          and(eq(Relays.fromUserId, fromUserId), eq(Relays.toUserId, target.id), inArray(Relays.status, openStatuses)),
        ),
      tx
        .select({ n: count() })
        .from(Relays)
        .where(and(eq(Relays.toUserId, target.id), inArray(Relays.status, openStatuses))),
    ]);
    const cap = relayCapMessage(
      { sentToday: sent?.n ?? 0, openToPair: toPair?.n ?? 0, openForRecipient: forRecipient?.n ?? 0 },
      target.username,
    );
    if (cap) return yield* new RelayLimitReached({ message: cap });

    // Telling the recipient and telling the sender the answer are two model
    // turns, half a message to each side each: the sender pays for both.
    if (!(yield* canSpend(fromUserId, RELAY_UNITS_PER_SIDE * 2))) {
      return yield* new RelayNotAllowed({
        message: refusalMessage("out_of_messages", target.username),
        reason: "out_of_messages",
      });
    }
    if (!(yield* canSpend(target.id, RELAY_UNITS_PER_SIDE))) {
      return yield* new RelayNotAllowed({ message: refusalMessage("unavailable", target.username), reason: "unavailable" });
    }
  });

/** A resolved recipient with a username (onboarded). */
const withUsername = (row: PersonRow) =>
  row.username ? Effect.succeed({ ...row, username: row.username }) : Effect.fail(noOne(""));

/**
 * Whether the user could send a relay to `to` (a username, or a
 * connection's name) right now, without sending it: Tibo checks before it
 * asks the user to confirm the words. Answers who it would go to.
 */
export const checkRelay = Effect.fn("checkRelay")(function* (fromUserId: string, to: string) {
  const input = yield* decodeInput(RelayRecipient)(to);
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const target = yield* resolveRecipient(tx, fromUserId, input, true).pipe(Effect.flatMap(withUsername));
      yield* vet(tx, fromUserId, target);
      return { username: target.username, name: target.name };
    }),
  );
});

/**
 * Sends a relay from `fromUserId` to `toUsername` (exact, as `checkRelay`
 * resolved it): every rule again, then the row. The agent delivers it to
 * the recipient's Tibo next. Limited to a burst per minute (`LIMITS.relay`)
 * and `RELAYS_PER_DAY` in any 24 hours.
 */
export const sendRelay = Effect.fn("sendRelay")(function* (fromUserId: string, input: unknown) {
  const raw = input as { toUsername?: unknown; message?: unknown } | null;
  const { toUsername, message } = yield* decodeInput(SendRelayInput)({
    toUsername: raw?.toUsername,
    message: typeof raw?.message === "string" ? raw.message.trim() : raw?.message,
  });
  const limiter = yield* RateLimiter;
  if (!(yield* limiter.allow("relay", fromUserId))) {
    return yield* new RelayLimitReached({
      message: "The user is sending messages through Tibo quickly. Wait a minute and try again.",
    });
  }
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const target = yield* resolveRecipient(tx, fromUserId, toUsername, false).pipe(Effect.flatMap(withUsername));
      yield* lockUsers(tx, fromUserId, target.id);
      yield* vet(tx, fromUserId, target);
      const now = new Date();
      const [row] = yield* tx
        .insert(Relays)
        .values({
          id: newId(),
          fromUserId,
          toUserId: target.id,
          message,
          createdAt: now,
          expiresAt: expiresAtFor(now),
          updatedAt: now,
        })
        .returning();
      return toJson(row!, fromUserId, target);
    }),
  );
});

/** The relay with the other side's person, if the actor sent or received it. */
const findRelay = (tx: Executor, actorId: string, relayId: string, lock = false) =>
  Effect.gen(function* () {
    const query = tx
      .select()
      .from(Relays)
      .where(and(eq(Relays.id, relayId), or(eq(Relays.fromUserId, actorId), eq(Relays.toUserId, actorId))));
    const [row] = yield* lock ? query.for("update") : query;
    if (!row) return yield* notFound(relayId);
    const otherId = row.fromUserId === actorId ? row.toUserId : row.fromUserId;
    const [person] = yield* tx.select(personColumns).from(AuthUsers).where(eq(AuthUsers.id, otherId));
    if (!person) return yield* notFound(relayId);
    return { row, person };
  });

const decodeId = (relayId: string) =>
  decodeInput(Id)(relayId).pipe(Effect.catch(() => Effect.fail(notFound(String(relayId).slice(0, 64)))));

/** One relay, from the actor's side. */
export const getRelay = Effect.fn("getRelay")(function* (actorId: string, relayId: string) {
  const id = yield* decodeId(relayId);
  const db = yield* Database;
  const { row, person } = yield* findRelay(db, actorId, id).pipe(orDieOnDbError);
  return toJson(row, actorId, person);
});

/**
 * The recipient's Tibo has the relay and is telling them. Delivering twice
 * is fine; a relay past its time expires instead (the answer says so).
 */
export const markRelayDelivered = Effect.fn("markRelayDelivered")(function* (actorId: string, relayId: string) {
  const id = yield* decodeId(relayId);
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const { row, person } = yield* findRelay(tx, actorId, id, true);
      if (row.toUserId !== actorId) return yield* notFound(id);
      const now = new Date();
      let next = row;
      if (row.status === "pending" && row.expiresAt <= now) {
        [next] = yield* tx
          .update(Relays)
          .set({ status: "expired", ...syncAfter("pending", "expired") })
          .where(eq(Relays.id, id))
          .returning();
      } else if (row.status === "pending" || (row.status === "delivered" && !row.recipientSynced)) {
        [next] = yield* tx
          .update(Relays)
          .set({ status: "delivered", deliveredAt: row.deliveredAt ?? now, retryAt: null, ...syncAfter("pending", "delivered") })
          .where(eq(Relays.id, id))
          .returning();
      }
      return toJson(next!, actorId, person);
    }),
  );
});

/** The recipient's Tibo couldn't take the relay yet (someone's out of quota): try again later. */
export const holdRelay = Effect.fn("holdRelay")(function* (actorId: string, relayId: string) {
  const id = yield* decodeId(relayId);
  const db = yield* Database;
  yield* db
    .update(Relays)
    .set({ retryAt: new Date(Date.now() + HOLD_RETRY_MS) })
    .where(and(eq(Relays.id, id), or(eq(Relays.fromUserId, actorId), eq(Relays.toUserId, actorId))))
    .pipe(orDieOnDbError);
});

/**
 * The recipient closes a delivered relay: `answered` with their words, or
 * `declined`. Only the recipient may; the sender's Tibo hears next.
 */
const closeByRecipient = (actorId: string, relayId: string, outcome: "answered" | "declined", answer: string | null) =>
  Effect.gen(function* () {
    const id = yield* decodeId(relayId);
    const db = yield* Database;
    return yield* transaction(db, (tx) =>
      Effect.gen(function* () {
        const { row, person } = yield* findRelay(tx, actorId, id, true);
        if (row.toUserId !== actorId) return yield* notFound(id);
        const now = new Date();
        if (isOpen(row.status) && row.expiresAt <= now) {
          yield* tx
            .update(Relays)
            .set({ status: "expired", ...syncAfter(row.status, "expired") })
            .where(eq(Relays.id, id));
          return yield* new RelayClosed({ message: "That message expired before it was answered.", status: "expired" });
        }
        if (row.status !== "delivered") {
          return yield* new RelayClosed({ message: closedMessage(row.status), status: row.status });
        }
        const [next] = yield* tx
          .update(Relays)
          .set({ status: outcome, answer, answeredAt: now, retryAt: null, ...syncAfter("delivered", outcome) })
          .where(eq(Relays.id, id))
          .returning();
        return toJson(next!, actorId, person);
      }),
    );
  });

const closedMessage = (status: RelayStatus) =>
  ({
    pending: "That message hasn't reached the user yet.",
    delivered: "That message is still waiting for an answer.",
    answered: "That message was already answered.",
    declined: "The user already chose not to answer that message.",
    expired: "That message expired before it was answered.",
    cancelled: "That message isn't open any more.",
  })[status];

/** The recipient's answer, in words they confirmed. */
export const answerRelay = Effect.fn("answerRelay")(function* (actorId: string, relayId: string, answer: unknown) {
  const text = yield* decodeInput(RelayText)(typeof answer === "string" ? answer.trim() : answer);
  return yield* closeByRecipient(actorId, relayId, "answered", text);
});

/** The recipient won't answer. */
export const declineRelay = Effect.fn("declineRelay")(function* (actorId: string, relayId: string) {
  return yield* closeByRecipient(actorId, relayId, "declined", null);
});

/**
 * The actor's Tibo has caught up with the relay at `status` (shown the
 * card, told its user). A newer change keeps it owed.
 */
export const ackRelay = Effect.fn("ackRelay")(function* (actorId: string, relayId: string, status: RelayStatus) {
  const id = yield* decodeId(relayId);
  const db = yield* Database;
  yield* Effect.all(
    [
      db
        .update(Relays)
        .set({ senderSynced: true })
        .where(and(eq(Relays.id, id), eq(Relays.fromUserId, actorId), eq(Relays.status, status))),
      db
        .update(Relays)
        .set({ recipientSynced: true })
        .where(and(eq(Relays.id, id), eq(Relays.toUserId, actorId), eq(Relays.status, status))),
    ],
    { discard: true },
  ).pipe(orDieOnDbError);
});

/** The user's latest relays, sent and received, newest first. */
export const listRelays = Effect.fn("listRelays")(function* (actorId: string) {
  const db = yield* Database;
  const rows = yield* db
    .select()
    .from(Relays)
    .where(or(eq(Relays.fromUserId, actorId), eq(Relays.toUserId, actorId)))
    .orderBy(desc(Relays.createdAt))
    .limit(LIST_LIMIT)
    .pipe(orDieOnDbError);
  const otherIds = [...new Set(rows.map((row) => (row.fromUserId === actorId ? row.toUserId : row.fromUserId)))];
  const people =
    otherIds.length === 0
      ? []
      : yield* db.select(personColumns).from(AuthUsers).where(inArray(AuthUsers.id, otherIds)).pipe(orDieOnDbError);
  const byId = new Map(people.map((person) => [person.id, person]));
  return rows.flatMap((row) => {
    const person = byId.get(row.fromUserId === actorId ? row.toUserId : row.fromUserId);
    return person ? [toJson(row, actorId, person)] : [];
  });
});

/**
 * Development only (through the agent's `dev/*` routes): the sender makes
 * their open relay due now, so the next sweep expires it.
 */
export const expireRelayNow = Effect.fn("expireRelayNow")(function* (actorId: string, relayId: string) {
  const id = yield* decodeId(relayId);
  const db = yield* Database;
  const rows = yield* db
    .update(Relays)
    .set({ expiresAt: new Date() })
    .where(and(eq(Relays.id, id), eq(Relays.fromUserId, actorId), inArray(Relays.status, openStatuses)))
    .returning({ id: Relays.id })
    .pipe(orDieOnDbError);
  if (rows.length === 0) return yield* notFound(id);
});

/**
 * Every minute (the AgentWorker's cron): expires open relays past their
 * time, then claims up to `RELAY_SWEEP_BATCH` that an agent still has to
 * hear about (left a moment for the direct path between agents, and
 * spaced out after a failed try).
 */
export const sweepRelays = Effect.fn("sweepRelays")(function* () {
  const db = yield* Database;
  const now = new Date();
  yield* db
    .update(Relays)
    .set({
      status: "expired",
      senderSynced: false,
      // A relay still pending was never shown to the recipient.
      recipientSynced: sql`${Relays.status} = 'pending'`,
    })
    .where(and(inArray(Relays.status, openStatuses), lte(Relays.expiresAt, now)))
    .pipe(orDieOnDbError);
  // Two steps: the effect driver doesn't render a subquery inside `inArray`.
  const due = yield* db
    .select({ id: Relays.id })
    .from(Relays)
    .where(
      and(
        or(eq(Relays.senderSynced, false), eq(Relays.recipientSynced, false)),
        lte(Relays.updatedAt, new Date(now.getTime() - SWEEP_GRACE_MS)),
        or(isNull(Relays.retryAt), lte(Relays.retryAt, now)),
      ),
    )
    .orderBy(asc(Relays.updatedAt))
    .limit(RELAY_SWEEP_BATCH)
    .pipe(orDieOnDbError);
  if (due.length === 0) return [];
  const rows = yield* db
    .update(Relays)
    // A claim isn't a change: `updated_at` stays, so the order holds.
    .set({ retryAt: new Date(now.getTime() + SWEEP_RETRY_MS), updatedAt: sql`${Relays.updatedAt}` })
    .where(inArray(Relays.id, due.map((row) => row.id)))
    .returning({
      id: Relays.id,
      fromUserId: Relays.fromUserId,
      toUserId: Relays.toUserId,
      senderSynced: Relays.senderSynced,
      recipientSynced: Relays.recipientSynced,
    })
    .pipe(orDieOnDbError);
  return rows satisfies RelaySyncJson[];
});

/**
 * A block closes every open relay between the two, in the block's own
 * transaction. Only the blocker's Tibo hears (its cards say "cancelled");
 * the blocked user is never told, as with everything else about blocks.
 */
export const cancelRelaysBetween = (tx: Executor, blockerId: string, blockedId: string) =>
  tx
    .update(Relays)
    .set({
      status: "cancelled",
      senderSynced: sql`${Relays.fromUserId} <> ${blockerId}`,
      // Only a delivered relay has a card on the recipient's side.
      recipientSynced: sql`not (${Relays.toUserId} = ${blockerId} and ${Relays.status} = 'delivered')`,
      retryAt: null,
    })
    .where(
      and(
        inArray(Relays.status, openStatuses),
        or(
          and(eq(Relays.fromUserId, blockerId), eq(Relays.toUserId, blockedId)),
          and(eq(Relays.fromUserId, blockedId), eq(Relays.toUserId, blockerId)),
        ),
      ),
    );

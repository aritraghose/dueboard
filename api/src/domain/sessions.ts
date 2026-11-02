import { and, asc, desc, eq, inArray, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import * as Effect from "effect/Effect";
import {
  Activity,
  FocusSessionSegments,
  FocusSessions,
  UserSettings,
  type FocusSessionRow,
} from "../schema.ts";
import { deleteActivityFor, recordActivity } from "./activity.ts";
import { FALLBACK_TIME_ZONE, LocalDate, localDateOf, todayIn } from "./dates.ts";
import { Database, newId, transaction, type Executor } from "./database.ts";
import {
  ActiveSessionExists,
  ExtendSessionInput,
  FocusSession,
  Id,
  InvalidInput,
  ListSessionsInput,
  SESSION_PAGE_SIZE_DEFAULT,
  SessionDay,
  SessionNotFound,
  SessionPage,
  SessionTransitionNotAllowed,
  SessionsForDay,
  StartSessionInput,
  decodeInput,
  type SessionAction,
} from "./model.ts";
import { decodeNoteCursor, encodeNoteCursor, groupByDay } from "./notes-rules.ts";
import {
  computeEndsAt,
  elapsed,
  elapsedByDay,
  extendError,
  focusedMinutes,
  remaining,
  transitionError,
  type Segment,
} from "./session-rules.ts";

// Focus sessions (planning.md "Focus sessions", architecture.md §4 and §11).
// At most one session per user is running or paused, which a partial unique
// index enforces. Each running stretch is a segment; elapsed time is their
// sum, and `ends_at` (set only while running) is when the time runs out.
// Expired sessions are completed by the cron sweep (`sweepExpiredSessions`,
// run every minute by `../api.ts`) and lazily by every read and write here,
// both through `completeExpiredSessions`, so reads are right between sweeps.

const ACTIVE = ["running", "paused"] as const;

/** Sessions completed per sweep batch; the sweep runs batches until one comes back short. */
const SWEEP_BATCH = 200;
/** Batches per sweep run, so one run can't go on forever; the next minute's run picks up the rest. */
const SWEEP_MAX_BATCHES = 25;

export const toSession = (
  row: FocusSessionRow,
  segments: ReadonlyArray<Segment>,
  now: Date,
): FocusSession => {
  const ended = row.status === "completed" || row.status === "stopped";
  return new FocusSession({
    id: row.id,
    label: row.label,
    plannedMinutes: row.plannedMinutes,
    status: row.status,
    localDate: row.localDate,
    startedAt: row.startedAt,
    endsAt: row.endsAt,
    endedAt: row.endedAt,
    elapsedMs: elapsed(segments, now),
    remainingMs: ended ? 0 : remaining(row.plannedMinutes, segments, now),
    privacy: row.privacy,
    shareToLive: row.shareToLive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
};

const notFound = (id: string) =>
  new SessionNotFound({ message: "That session no longer exists.", id });

/** One of the user's sessions, locked for the rest of the transaction when `lock` is set. */
const findSession = (tx: Executor, userId: string, id: string, lock = false) =>
  Effect.gen(function* () {
    const query = tx
      .select()
      .from(FocusSessions)
      .where(and(eq(FocusSessions.id, id), eq(FocusSessions.userId, userId)));
    const [row] = yield* lock ? query.for("update") : query;
    if (!row) return yield* notFound(id);
    return row;
  });

/** The segments of `sessionIds`, oldest first, by session id. */
const loadSegments = (tx: Executor, sessionIds: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const bySession = new Map<string, Array<Segment>>();
    if (sessionIds.length === 0) return bySession;
    const rows = yield* tx
      .select()
      .from(FocusSessionSegments)
      .where(inArray(FocusSessionSegments.sessionId, [...sessionIds]))
      .orderBy(asc(FocusSessionSegments.startedAt));
    for (const row of rows) {
      const list = bySession.get(row.sessionId) ?? [];
      list.push(row);
      bySession.set(row.sessionId, list);
    }
    return bySession;
  });

/** `rows` as sessions measured at `now`, with their segments loaded. */
const withSegments = (tx: Executor, rows: ReadonlyArray<FocusSessionRow>, now: Date) =>
  Effect.gen(function* () {
    const segments = yield* loadSegments(
      tx,
      rows.map((row) => row.id),
    );
    return rows.map((row) => toSession(row, segments.get(row.id) ?? [], now));
  });

/** Closes a session's open segment at `at` (a no-op while paused). */
const closeOpenSegment = (tx: Executor, sessionId: string, at: Date) =>
  tx
    .update(FocusSessionSegments)
    .set({ endedAt: at })
    .where(
      and(eq(FocusSessionSegments.sessionId, sessionId), isNull(FocusSessionSegments.endedAt)),
    );

// ─── Completion ──────────────────────────────────────────────────────────────

/**
 * Seam for step 20: called in the completing transaction with the sessions
 * whose time just ran out (by the sweep or a lazy read), so Tibo can send a
 * "session done" message. Sessions the user stopped never reach it.
 */
export const onSessionCompleted = (
  _tx: Executor,
  _sessions: ReadonlyArray<FocusSessionRow>,
): Effect.Effect<void> => Effect.void;

/**
 * Completes up to `limit` running sessions whose `ends_at <= now` (only
 * `userId`'s when given): status `completed`, `ended_at` and the last
 * segment's end set to `ends_at`, one `session_completed` activity each.
 * Rows another transaction holds are skipped, so the sweep never waits on a
 * user's write (that write sees the expiry itself). Running it twice
 * completes nothing the second time. Returns the completed rows.
 */
export const completeExpiredSessions = Effect.fn("completeExpiredSessions")(function* (
  tx: Executor,
  options: { readonly now: Date; readonly userId?: string; readonly limit?: number },
) {
  const expired = tx
    .select({ id: FocusSessions.id })
    .from(FocusSessions)
    .where(
      and(
        eq(FocusSessions.status, "running"),
        lte(FocusSessions.endsAt, options.now),
        options.userId === undefined ? undefined : eq(FocusSessions.userId, options.userId),
      ),
    )
    .orderBy(asc(FocusSessions.endsAt))
    .limit(options.limit ?? SWEEP_BATCH)
    .for("update", { skipLocked: true });
  // `SET` reads the old row, so `ended_at` takes `ends_at` before it's cleared.
  const completed = yield* tx
    .update(FocusSessions)
    .set({ status: "completed", endedAt: sql`${FocusSessions.endsAt}`, endsAt: null })
    .where(and(inArray(FocusSessions.id, expired), eq(FocusSessions.status, "running")))
    .returning();
  if (completed.length === 0) return completed;

  const ids = completed.map((row) => row.id);
  // `greatest` can't change a real close (`ends_at` is never before the open
  // segment's start), but keeps one odd row from failing every batch.
  yield* tx
    .update(FocusSessionSegments)
    .set({
      endedAt: sql`greatest("focus_sessions"."ended_at", "focus_session_segments"."started_at")`,
    })
    .from(FocusSessions)
    .where(
      and(
        eq(FocusSessionSegments.sessionId, FocusSessions.id),
        inArray(FocusSessions.id, ids),
        isNull(FocusSessionSegments.endedAt),
      ),
    );

  const userIds = [...new Set(completed.map((row) => row.userId))];
  const zones = yield* tx
    .select({ userId: UserSettings.userId, timeZone: UserSettings.timeZone })
    .from(UserSettings)
    .where(inArray(UserSettings.userId, userIds));
  const zoneOf = new Map(zones.map((row) => [row.userId, row.timeZone]));
  yield* tx.insert(Activity).values(
    completed.map((row) => ({
      id: newId(),
      userId: row.userId,
      kind: "session_completed" as const,
      subjectType: "session" as const,
      subjectId: row.id,
      occurredAt: row.endedAt!,
      localDate: localDateOf(row.endedAt!, zoneOf.get(row.userId) ?? FALLBACK_TIME_ZONE),
      meta: {},
    })),
  );
  yield* onSessionCompleted(tx, completed);
  return completed;
});

/**
 * The cron sweep: completes every expired running session, in batches of
 * 200, each in its own transaction. Returns how many it completed.
 */
export const sweepExpiredSessions = Effect.fn("sweepExpiredSessions")(function* () {
  const db = yield* Database;
  let total = 0;
  for (let batch = 0; batch < SWEEP_MAX_BATCHES; batch++) {
    const completed = yield* transaction(db, (tx) =>
      completeExpiredSessions(tx, { now: new Date(), limit: SWEEP_BATCH }),
    );
    total += completed.length;
    if (completed.length < SWEEP_BATCH) break;
  }
  return total;
});

/** Stops an active session at `now`, with a `session_stopped` activity. */
const stopRow = (tx: Executor, row: FocusSessionRow, now: Date, timeZone?: string) =>
  Effect.gen(function* () {
    yield* closeOpenSegment(tx, row.id, now);
    const [stopped] = yield* tx
      .update(FocusSessions)
      .set({ status: "stopped", endsAt: null, endedAt: now })
      .where(eq(FocusSessions.id, row.id))
      .returning();
    yield* recordActivity(tx, {
      userId: row.userId,
      kind: "session_stopped",
      subjectType: "session",
      subjectId: row.id,
      occurredAt: now,
      ...(timeZone ? { timeZone } : {}),
    });
    return stopped!;
  });

// ─── Writes ──────────────────────────────────────────────────────────────────

/**
 * Starts a running session now, with a `session_started` activity. While
 * another is running or paused, fails with `ActiveSessionExists` (carrying
 * it), or with `replaceActive` stops it first in the same transaction.
 */
export const startSession = Effect.fn("startSession")(function* (
  userId: string,
  input: StartSessionInput,
) {
  const values = yield* decodeInput(StartSessionInput)(input);
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      // Locking the settings row serializes the user's starts, so two
      // concurrent ones meet here instead of at the unique index.
      const [settings] = yield* tx
        .select({
          timeZone: UserSettings.timeZone,
          defaultPrivacy: UserSettings.defaultPrivacy,
          defaultShareToLive: UserSettings.defaultShareToLive,
        })
        .from(UserSettings)
        .where(eq(UserSettings.userId, userId))
        .for("update");
      // `Bootstrap` creates the row on every app load, so a missing one is a bug.
      if (!settings) return yield* Effect.die(new Error(`User ${userId} has no settings`));
      const now = new Date();
      yield* completeExpiredSessions(tx, { userId, now });

      const [active] = yield* tx
        .select()
        .from(FocusSessions)
        .where(and(eq(FocusSessions.userId, userId), inArray(FocusSessions.status, [...ACTIVE])))
        .for("update");
      if (active) {
        if (!values.replaceActive) {
          const [session] = yield* withSegments(tx, [active], now);
          return yield* new ActiveSessionExists({
            message: "Another session is still going. Starting this one will stop it.",
            session: session!,
          });
        }
        yield* stopRow(tx, active, now, settings.timeZone);
      }

      const localDate = todayIn(settings.timeZone, now);
      const [row] = yield* tx
        .insert(FocusSessions)
        .values({
          id: newId(),
          userId,
          label: values.label ?? null,
          plannedMinutes: values.minutes,
          status: "running",
          localDate,
          startedAt: now,
          endsAt: computeEndsAt(values.minutes, [], now),
          privacy: values.privacy ?? settings.defaultPrivacy,
          shareToLive: values.shareToLive ?? settings.defaultShareToLive,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      const session = row!;
      const [segment] = yield* tx
        .insert(FocusSessionSegments)
        .values({ id: newId(), sessionId: session.id, startedAt: now })
        .returning();
      yield* recordActivity(tx, {
        userId,
        kind: "session_started",
        subjectType: "session",
        subjectId: session.id,
        occurredAt: now,
        localDate,
      });
      return toSession(session, [segment!], now);
    }),
  );
});

/**
 * Runs `action` on one of the user's sessions: completes expired sessions
 * first, locks the row, refuses a transition its status doesn't allow,
 * then applies `change` and returns the session as of now.
 */
const changeSession = <E, R>(
  userId: string,
  id: string,
  action: SessionAction,
  change: (tx: Executor, row: FocusSessionRow, now: Date) => Effect.Effect<FocusSessionRow, E, R>,
) =>
  Effect.gen(function* () {
    yield* decodeInput(Id)(id);
    const db = yield* Database;
    return yield* transaction(db, (tx) =>
      Effect.gen(function* () {
        const now = new Date();
        yield* completeExpiredSessions(tx, { userId, now });
        const row = yield* findSession(tx, userId, id, true);
        const error = transitionError(row.status, action);
        if (error) return yield* new SessionTransitionNotAllowed({ message: error, status: row.status });
        const updated = yield* change(tx, row, now);
        const [session] = yield* withSegments(tx, [updated], now);
        return session!;
      }),
    );
  });

/** Pauses a running session: closes its segment and clears `ends_at`. */
export const pauseSession = Effect.fn("pauseSession")(function* (userId: string, id: string) {
  return yield* changeSession(userId, id, "pause", (tx, row, now) =>
    Effect.gen(function* () {
      yield* closeOpenSegment(tx, row.id, now);
      const [updated] = yield* tx
        .update(FocusSessions)
        .set({ status: "paused", endsAt: null })
        .where(eq(FocusSessions.id, row.id))
        .returning();
      return updated!;
    }),
  );
});

/** Resumes a paused session: opens a segment and sets `ends_at` from the time left. */
export const resumeSession = Effect.fn("resumeSession")(function* (userId: string, id: string) {
  return yield* changeSession(userId, id, "resume", (tx, row, now) =>
    Effect.gen(function* () {
      yield* tx
        .insert(FocusSessionSegments)
        .values({ id: newId(), sessionId: row.id, startedAt: now });
      const segments = (yield* loadSegments(tx, [row.id])).get(row.id) ?? [];
      const [updated] = yield* tx
        .update(FocusSessions)
        .set({ status: "running", endsAt: computeEndsAt(row.plannedMinutes, segments, now) })
        .where(eq(FocusSessions.id, row.id))
        .returning();
      return updated!;
    }),
  );
});

/**
 * Adds minutes to a running or paused session (the total stays within
 * 600), moving a running session's `ends_at` later by as much.
 */
export const extendSession = Effect.fn("extendSession")(function* (
  userId: string,
  input: ExtendSessionInput,
) {
  const { id, minutes } = yield* decodeInput(ExtendSessionInput)(input);
  return yield* changeSession(userId, id, "extend", (tx, row, now) =>
    Effect.gen(function* () {
      const error = extendError(row.plannedMinutes, minutes);
      if (error) return yield* new InvalidInput({ message: error });
      const plannedMinutes = row.plannedMinutes + minutes;
      let endsAt: Date | null = null;
      if (row.status === "running") {
        const segments = (yield* loadSegments(tx, [row.id])).get(row.id) ?? [];
        endsAt = computeEndsAt(plannedMinutes, segments, now);
      }
      const [updated] = yield* tx
        .update(FocusSessions)
        .set({ plannedMinutes, endsAt })
        .where(eq(FocusSessions.id, row.id))
        .returning();
      return updated!;
    }),
  );
});

/** Ends a running or paused session early, as `stopped`, with a `session_stopped` activity. */
export const stopSession = Effect.fn("stopSession")(function* (userId: string, id: string) {
  return yield* changeSession(userId, id, "stop", (tx, row, now) => stopRow(tx, row, now));
});

/** Deletes a session (any status), its segments and its activity, and returns its id. */
export const deleteSession = Effect.fn("deleteSession")(function* (userId: string, id: string) {
  yield* decodeInput(Id)(id);
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      yield* findSession(tx, userId, id, true);
      yield* deleteActivityFor(tx, "session", id);
      yield* tx
        .delete(FocusSessions)
        .where(and(eq(FocusSessions.id, id), eq(FocusSessions.userId, userId)));
      return id;
    }),
  );
});

// ─── Reads ───────────────────────────────────────────────────────────────────
// Each read first completes the user's expired sessions, so it never shows
// a running session whose time has run out.

/** The user's running or paused session, or `null`. */
export const getActiveSession = Effect.fn("getActiveSession")(function* (userId: string) {
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const now = new Date();
      yield* completeExpiredSessions(tx, { userId, now });
      const rows = yield* tx
        .select()
        .from(FocusSessions)
        .where(and(eq(FocusSessions.userId, userId), inArray(FocusSessions.status, [...ACTIVE])));
      const [session] = yield* withSegments(tx, rows, now);
      return session ?? null;
    }),
  );
});

/** The sessions started on `date` (the user's local day), oldest first, with that day's focused minutes. */
export const listSessionsForDay = Effect.fn("listSessionsForDay")(function* (
  userId: string,
  date: LocalDate,
) {
  const day = yield* decodeInput(LocalDate)(date);
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const now = new Date();
      yield* completeExpiredSessions(tx, { userId, now });
      const rows = yield* tx
        .select()
        .from(FocusSessions)
        .where(and(eq(FocusSessions.userId, userId), eq(FocusSessions.localDate, day)))
        .orderBy(asc(FocusSessions.startedAt), asc(FocusSessions.id));
      const sessions = yield* withSegments(tx, rows, now);
      const total = sessions.reduce((sum, session) => sum + session.elapsedMs, 0);
      return new SessionsForDay({ date: day, focusedMinutes: focusedMinutes(total), sessions });
    }),
  );
});

/**
 * `/sessions`: newest day first, newest session first, grouped by day with
 * each day's focused minutes, paginated by cursor.
 */
export const listSessions = Effect.fn("listSessions")(function* (
  userId: string,
  input: ListSessionsInput,
) {
  const filters = yield* decodeInput(ListSessionsInput)(input);
  // Same `<date>|<ISO timestamp>|<id>` shape as `ListNotes`, keyed on `started_at`.
  const cursor = filters.cursor === undefined ? undefined : decodeNoteCursor(filters.cursor);
  if (cursor === null) {
    return yield* new InvalidInput({ message: "That page link is invalid. Reload the list." });
  }
  const conditions: Array<SQL | undefined> = [
    eq(FocusSessions.userId, userId),
    cursor
      ? or(
          lt(FocusSessions.localDate, cursor.localDate),
          and(
            eq(FocusSessions.localDate, cursor.localDate),
            lt(FocusSessions.startedAt, cursor.createdAt),
          ),
          and(
            eq(FocusSessions.localDate, cursor.localDate),
            eq(FocusSessions.startedAt, cursor.createdAt),
            lt(FocusSessions.id, cursor.id),
          ),
        )
      : undefined,
  ];
  const limit = filters.limit ?? SESSION_PAGE_SIZE_DEFAULT;
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const now = new Date();
      yield* completeExpiredSessions(tx, { userId, now });
      const rows = yield* tx
        .select()
        .from(FocusSessions)
        .where(and(...conditions))
        .orderBy(desc(FocusSessions.localDate), desc(FocusSessions.startedAt), desc(FocusSessions.id))
        .limit(limit + 1);
      const page = rows.slice(0, limit);
      const sessions = yield* withSegments(tx, page, now);

      // A day can run across pages, so its total counts all of that day's
      // sessions, not just the ones on this page.
      const dates = [...new Set(page.map((row) => row.localDate))];
      const sameDays =
        dates.length === 0
          ? []
          : yield* tx
              .select({ id: FocusSessions.id, localDate: FocusSessions.localDate })
              .from(FocusSessions)
              .where(and(eq(FocusSessions.userId, userId), inArray(FocusSessions.localDate, dates)));
      const segments = yield* loadSegments(
        tx,
        sameDays.map((row) => row.id),
      );
      const totals = elapsedByDay(
        sameDays.map((row) => ({ localDate: row.localDate, segments: segments.get(row.id) ?? [] })),
        now,
      );

      const last = page.at(-1);
      return new SessionPage({
        days: groupByDay(sessions).map(
          (day) =>
            new SessionDay({
              date: day.date,
              focusedMinutes: focusedMinutes(totals.get(day.date) ?? 0),
              sessions: day.notes,
            }),
        ),
        nextCursor:
          rows.length > limit && last
            ? encodeNoteCursor({ localDate: last.localDate, createdAt: last.startedAt, id: last.id })
            : null,
      });
    }),
  );
});

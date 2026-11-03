import { and, asc, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import * as Effect from "effect/Effect";
import {
  Activity,
  GoalLinks,
  GoalProgressEvents,
  Goals,
  Habits,
  Tasks,
  UserSettings,
  type GoalLinkRow,
  type GoalProgressEventRow,
  type GoalRow,
} from "../schema.ts";
import { deleteActivityFor, recordActivity } from "./activity.ts";
import { LocalDate, localDateOf } from "./dates.ts";
import { Database, newId, orDieOnDbError, transaction, type Executor } from "./database.ts";
import {
  completionChange,
  convertProgress,
  dayProgressAction,
  deltaError,
  goalPercent,
  goalValue,
  isReached,
  linkedDelta,
  valueError,
  withValue,
  type GoalProgress,
} from "./goal-rules.ts";
import {
  AdjustGoalProgressInput,
  CreateGoalInput,
  GOAL_EVENTS_IN_DETAIL,
  GOAL_EVENTS_IN_LIST,
  GOAL_LINKS_MAX,
  Goal,
  GoalItemRef,
  GoalLink,
  GoalNotFound,
  GoalProgressEvent,
  GoalSummary,
  GoalsForDay,
  HabitNotFound,
  Id,
  InvalidInput,
  ItemGoal,
  LinkGoalItemInput,
  ListGoalsInput,
  SetGoalProgressInput,
  TaskNotFound,
  UnlinkGoalItemInput,
  UpdateGoalInput,
  decodeInput,
  type GoalLinkItem,
  type GoalProgressSource,
} from "./model.ts";

// The user's goals (planning.md "Goals", architecture.md §4). Progress is a
// slider percent or a count toward a target; `goal-rules.ts` derives the
// percent and decides completion. Count goals can link habits and tasks:
// each tap or settle adds the link's amount, and an undo or un-settle takes
// it back (never more than it added), inside the habit's or task's own
// transaction.
//
// Every change writes a `goal_progress_events` row. Live gets at most one
// `goal_progressed` row per goal and day (updated in place, and dropped when
// the day's changes cancel out), plus a `goal_completed` row while the goal
// is completed.

export const toGoal = (row: GoalRow): Goal =>
  new Goal({
    id: row.id,
    name: row.name,
    description: row.description,
    progressMode: row.progressMode,
    progressPercent: row.progressPercent,
    targetCount: row.targetCount,
    currentCount: row.currentCount,
    targetDate: row.targetDate,
    status: row.status,
    completedAt: row.completedAt,
    privacy: row.privacy,
    shareToLive: row.shareToLive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

const toLink = (row: GoalLinkRow, itemTitle: string): GoalLink =>
  new GoalLink({
    id: row.id,
    goalId: row.goalId,
    itemType: row.itemType,
    itemId: row.itemId,
    amount: row.amount,
    itemTitle,
    createdAt: row.createdAt,
  });

const toEvent = (row: GoalProgressEventRow): GoalProgressEvent =>
  new GoalProgressEvent({
    id: row.id,
    delta: row.delta,
    valueAfter: row.valueAfter,
    source: row.source,
    sourceId: row.sourceId,
    sourceDate: row.sourceDate,
    createdAt: row.createdAt,
  });

const notFound = (id: string) => new GoalNotFound({ message: "That goal no longer exists.", id });

/** One of the user's goals, locked for the rest of the transaction when `lock` is set. */
const findGoal = (tx: Executor, userId: string, id: string, lock = false) =>
  Effect.gen(function* () {
    const query = tx
      .select()
      .from(Goals)
      .where(and(eq(Goals.id, id), eq(Goals.userId, userId)));
    const [row] = yield* lock ? query.for("update") : query;
    if (!row) return yield* notFound(id);
    return row;
  });

/** The user's settings the goal writes need. */
const userSettings = (tx: Executor, userId: string) =>
  Effect.gen(function* () {
    const [settings] = yield* tx
      .select({
        timeZone: UserSettings.timeZone,
        defaultPrivacy: UserSettings.defaultPrivacy,
        defaultShareToLive: UserSettings.defaultShareToLive,
      })
      .from(UserSettings)
      .where(eq(UserSettings.userId, userId));
    // `Bootstrap` creates the row on every app load, so a missing one is a bug.
    if (!settings) return yield* Effect.die(new Error(`User ${userId} has no settings`));
    return settings;
  });

const invalid = (message: string) => Effect.fail(new InvalidInput({ message }));

/** Percent points can have decimals; keep the two `numeric` stores. */
const twoDecimals = (value: number) => Math.round(value * 100) / 100;

// ─── Progress ────────────────────────────────────────────────────────────────

/**
 * Saves `next` (the goal's progress columns, and `patch`'s other fields) on
 * the locked `goal`, completing or reopening it as the rules say. Completing
 * records `goal_completed`; reopening deletes it.
 */
const saveProgress = (
  tx: Executor,
  userId: string,
  goal: GoalRow,
  next: GoalProgress,
  now: Date,
  patch: Partial<Pick<GoalRow, "name" | "description" | "targetDate" | "privacy" | "shareToLive">> = {},
) =>
  Effect.gen(function* () {
    const change = completionChange(goal.status, isReached(goal), isReached(next));
    const status = change === "complete" ? "completed" : change === "reopen" ? "active" : goal.status;
    const [row] = yield* tx
      .update(Goals)
      .set({
        ...patch,
        progressMode: next.progressMode,
        progressPercent: next.progressPercent,
        targetCount: next.targetCount,
        currentCount: next.currentCount,
        status,
        completedAt: change === "complete" ? now : change === "reopen" ? null : goal.completedAt,
      })
      .where(and(eq(Goals.id, goal.id), eq(Goals.userId, userId)))
      .returning();
    if (change === "complete") {
      yield* recordActivity(tx, {
        userId,
        kind: "goal_completed",
        subjectType: "goal",
        subjectId: goal.id,
        occurredAt: now,
      });
    } else if (change === "reopen") {
      yield* deleteActivityFor(tx, "goal", goal.id, "goal_completed");
    }
    return row!;
  });

/**
 * Keeps the goal's one `goal_progressed` row for today (in the user's zone):
 * adds it on the day's first change, then moves its `valueAfter` and
 * `occurred_at`, and deletes it when the day ends where it began.
 */
const recordDayProgress = (
  tx: Executor,
  userId: string,
  timeZone: string,
  goal: GoalRow,
  valueBefore: number,
  now: Date,
) =>
  Effect.gen(function* () {
    const day = localDateOf(now, timeZone);
    const valueAfter = goalValue(goal);
    const meta = { valueAfter, percent: goalPercent(goal) };
    const [existing] = yield* tx
      .select({ id: Activity.id, meta: Activity.meta })
      .from(Activity)
      .where(
        and(
          eq(Activity.userId, userId),
          eq(Activity.subjectType, "goal"),
          eq(Activity.subjectId, goal.id),
          eq(Activity.kind, "goal_progressed"),
          eq(Activity.localDate, day),
        ),
      )
      .for("update");
    const action = dayProgressAction(existing ? Number(existing.meta.valueBefore) : null, valueAfter);
    if (action === "insert") {
      yield* recordActivity(tx, {
        userId,
        kind: "goal_progressed",
        subjectType: "goal",
        subjectId: goal.id,
        occurredAt: now,
        localDate: day,
        meta: { valueBefore, ...meta },
      });
    } else if (action === "update") {
      yield* tx
        .update(Activity)
        .set({ occurredAt: now, meta: { ...existing!.meta, ...meta } })
        .where(eq(Activity.id, existing!.id));
    } else {
      yield* tx.delete(Activity).where(eq(Activity.id, existing!.id));
    }
  });

interface ProgressSource {
  readonly source: GoalProgressSource;
  readonly sourceId: string | null;
  readonly sourceDate: LocalDate | null;
}

const manual: ProgressSource = { source: "manual", sourceId: null, sourceDate: null };

/**
 * Moves the locked `goal` to `value` (clamped to its range) and records the
 * change: a progress event, today's `goal_progressed` row, and completion.
 * Returns the goal as it is now; a change clamped to nothing writes nothing.
 */
const changeProgress = (
  tx: Executor,
  userId: string,
  timeZone: string,
  goal: GoalRow,
  value: number,
  source: ProgressSource,
  now: Date,
) =>
  Effect.gen(function* () {
    const before = goalValue(goal);
    const next = withValue(goal, value);
    const delta = twoDecimals(goalValue(next) - before);
    if (delta === 0) return goal;
    const row = yield* saveProgress(tx, userId, goal, next, now);
    yield* tx.insert(GoalProgressEvents).values({
      id: newId(),
      goalId: goal.id,
      userId,
      delta,
      valueAfter: goalValue(row),
      ...source,
      createdAt: now,
    });
    yield* recordDayProgress(tx, userId, timeZone, row, before, now);
    return row;
  });

// ─── Hooks (called by tasks.ts and habits.ts) ────────────────────────────────

/**
 * Moves every goal linked to the item by its link's amount: forward
 * (`direction` 1) or back (-1). A step back takes back no more than the
 * item added to that goal (for habits, on that check-in day), from the
 * progress events. Paused and completed goals move too: progress tracks
 * the work done, and every undo must find what its tap added.
 */
const applyLinked = (
  tx: Executor,
  userId: string,
  itemType: GoalLinkItem,
  itemId: string,
  direction: 1 | -1,
  sourceDate: LocalDate | null,
) =>
  Effect.gen(function* () {
    const links = yield* tx
      .select()
      .from(GoalLinks)
      .where(and(eq(GoalLinks.userId, userId), eq(GoalLinks.itemType, itemType), eq(GoalLinks.itemId, itemId)));
    if (links.length === 0) return;
    // Locked in id order, so two transactions touching the same goals can't deadlock.
    const goals = yield* tx
      .select()
      .from(Goals)
      .where(and(eq(Goals.userId, userId), inArray(Goals.id, links.map((l) => l.goalId))))
      .orderBy(asc(Goals.id))
      .for("update");
    const { timeZone } = yield* userSettings(tx, userId);
    const now = new Date();
    for (const goal of goals) {
      // Slider goals can't be linked; a guard in case one ever is.
      if (goal.progressMode !== "count") continue;
      const link = links.find((l) => l.goalId === goal.id)!;
      let added = 0;
      if (direction === -1) {
        const [net] = yield* tx
          .select({ total: sql<string | null>`sum(${GoalProgressEvents.delta})` })
          .from(GoalProgressEvents)
          .where(
            and(
              eq(GoalProgressEvents.goalId, goal.id),
              eq(GoalProgressEvents.source, itemType),
              eq(GoalProgressEvents.sourceId, itemId),
              sourceDate ? eq(GoalProgressEvents.sourceDate, sourceDate) : undefined,
            ),
          );
        added = Number(net?.total ?? 0);
      }
      const delta = linkedDelta(link.amount, direction, added);
      if (delta === 0) continue;
      yield* changeProgress(
        tx,
        userId,
        timeZone,
        goal,
        goalValue(goal) + delta,
        { source: itemType, sourceId: itemId, sourceDate },
        now,
      );
    }
  });

/** A linked task was settled: its goals gain the link's amount. */
export const onTaskSettled = (tx: Executor, userId: string, task: { readonly id: string }) =>
  applyLinked(tx, userId, "task", task.id, 1, null);

/** A linked task stopped being settled (or is being deleted while settled): its goals lose what it added. */
export const onTaskUnsettled = (tx: Executor, userId: string, task: { readonly id: string }) =>
  applyLinked(tx, userId, "task", task.id, -1, null);

/** A tap (`delta` 1) or undo (-1) on `date` for a linked habit. */
export const onHabitCheckIn = (
  tx: Executor,
  habit: { readonly id: string; readonly userId: string },
  delta: 1 | -1,
  date: LocalDate,
) => applyLinked(tx, habit.userId, "habit", habit.id, delta, date);

/**
 * Removes a deleted habit's or task's links. The progress it added stays:
 * the work was done (a settled task is un-settled first by `deleteTask`).
 */
export const deleteLinksFor = (tx: Executor, userId: string, itemType: GoalLinkItem, itemId: string) =>
  tx
    .delete(GoalLinks)
    .where(and(eq(GoalLinks.userId, userId), eq(GoalLinks.itemType, itemType), eq(GoalLinks.itemId, itemId)));

// ─── Writes ──────────────────────────────────────────────────────────────────

export const createGoal = Effect.fn("createGoal")(function* (userId: string, input: CreateGoalInput) {
  const values = yield* decodeInput(CreateGoalInput)(input);
  const mode = values.progressMode;
  if (mode === "count" && values.targetCount === undefined) {
    return yield* invalid("A count goal needs a target.");
  }
  if (mode === "slider" && values.targetCount !== undefined) {
    return yield* invalid("A slider goal has no target count.");
  }
  const start = values.value ?? 0;
  const startError = valueError(mode, start);
  if (startError) return yield* invalid(startError);
  const progress = withValue<GoalProgress>(
    {
      progressMode: mode,
      progressPercent: 0,
      targetCount: mode === "count" ? values.targetCount! : null,
      currentCount: mode === "count" ? 0 : null,
    },
    start,
  );
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const settings = yield* userSettings(tx, userId);
      const now = new Date();
      const completed = isReached(progress);
      const [row] = yield* tx
        .insert(Goals)
        .values({
          id: newId(),
          userId,
          name: values.name,
          description: values.description ?? null,
          ...progress,
          targetDate: values.targetDate ?? null,
          status: completed ? "completed" : "active",
          completedAt: completed ? now : null,
          privacy: values.privacy ?? settings.defaultPrivacy,
          shareToLive: values.shareToLive ?? settings.defaultShareToLive,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (completed) {
        yield* recordActivity(tx, {
          userId,
          kind: "goal_completed",
          subjectType: "goal",
          subjectId: row!.id,
          occurredAt: now,
          timeZone: settings.timeZone,
        });
      }
      return toGoal(row!);
    }),
  );
});

/**
 * Changes the fields `input` names. Switching the mode carries the progress
 * over and needs a goal with no links; a new target can complete or reopen
 * the goal. Neither writes a progress event: the work done didn't change.
 */
export const updateGoal = Effect.fn("updateGoal")(function* (userId: string, input: UpdateGoalInput) {
  const { id, progressMode, targetCount, ...patch } = yield* decodeInput(UpdateGoalInput)(input);
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const current = yield* findGoal(tx, userId, id, true);
      const mode = progressMode ?? current.progressMode;
      const switching = mode !== current.progressMode;
      if (mode === "slider" && targetCount !== undefined) {
        return yield* invalid("A slider goal has no target count.");
      }
      if (switching && mode === "count" && targetCount === undefined) {
        return yield* invalid("Switching to a count needs a target.");
      }
      if (switching) {
        const [link] = yield* tx
          .select({ id: GoalLinks.id })
          .from(GoalLinks)
          .where(eq(GoalLinks.goalId, id))
          .limit(1);
        if (link) return yield* invalid("Unlink this goal's habits and tasks before switching its progress type.");
      }
      if (!switching && targetCount === undefined) {
        if (Object.keys(patch).length === 0) return toGoal(current);
        const [row] = yield* tx
          .update(Goals)
          .set(patch)
          .where(and(eq(Goals.id, id), eq(Goals.userId, userId)))
          .returning();
        return toGoal(row!);
      }
      const next = convertProgress(current, mode, targetCount ?? null);
      return toGoal(yield* saveProgress(tx, userId, current, next, new Date(), patch));
    }),
  );
});

/** Sets the progress: a percent for a slider goal, a whole count (past the target too) for a count goal. */
export const setProgress = Effect.fn("setGoalProgress")(function* (userId: string, input: SetGoalProgressInput) {
  const { id, value } = yield* decodeInput(SetGoalProgressInput)(input);
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const goal = yield* findGoal(tx, userId, id, true);
      const error = valueError(goal.progressMode, value);
      if (error) return yield* invalid(error);
      const { timeZone } = yield* userSettings(tx, userId);
      return toGoal(yield* changeProgress(tx, userId, timeZone, goal, value, manual, new Date()));
    }),
  );
});

/** Moves the progress by `delta`, clamped to the goal's range (0–100%, or 0 and up). */
export const adjustProgress = Effect.fn("adjustGoalProgress")(function* (
  userId: string,
  input: AdjustGoalProgressInput,
) {
  const { id, delta } = yield* decodeInput(AdjustGoalProgressInput)(input);
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const goal = yield* findGoal(tx, userId, id, true);
      const error = deltaError(goal.progressMode, delta);
      if (error) return yield* invalid(error);
      const { timeZone } = yield* userSettings(tx, userId);
      return toGoal(
        yield* changeProgress(tx, userId, timeZone, goal, goalValue(goal) + delta, manual, new Date()),
      );
    }),
  );
});

/** Sets the status of the locked goal from `from` to `to`, or returns it as it is. */
const moveStatus = (
  userId: string,
  id: string,
  from: GoalRow["status"],
  to: GoalRow["status"],
  refuse?: { readonly status: GoalRow["status"]; readonly message: string },
) =>
  Effect.gen(function* () {
    yield* decodeInput(Id)(id);
    const db = yield* Database;
    return yield* transaction(db, (tx) =>
      Effect.gen(function* () {
        const goal = yield* findGoal(tx, userId, id, true);
        if (refuse && goal.status === refuse.status) return yield* invalid(refuse.message);
        if (goal.status !== from) return toGoal(goal);
        const [row] = yield* tx
          .update(Goals)
          .set({ status: to, ...(from === "completed" && { completedAt: null }) })
          .where(and(eq(Goals.id, id), eq(Goals.userId, userId)))
          .returning();
        if (from === "completed") yield* deleteActivityFor(tx, "goal", id, "goal_completed");
        return toGoal(row!);
      }),
    );
  });

/** Hides an active goal from `/now`. Linked habits and tasks still move it. */
export const pauseGoal = Effect.fn("pauseGoal")(function* (userId: string, id: string) {
  return yield* moveStatus(userId, id, "active", "paused", {
    status: "completed",
    message: "Reopen this goal before pausing it.",
  });
});

export const resumeGoal = Effect.fn("resumeGoal")(function* (userId: string, id: string) {
  return yield* moveStatus(userId, id, "paused", "active");
});

/**
 * Makes a completed goal active again, keeping its progress, and deletes its
 * `goal_completed` row. It completes again once it drops below the target
 * and reaches it, or after a higher target is reached.
 */
export const reopenGoal = Effect.fn("reopenGoal")(function* (userId: string, id: string) {
  return yield* moveStatus(userId, id, "completed", "active");
});

/** Deletes a goal with its links, progress events (both cascade) and activity. Returns the id. */
export const deleteGoal = Effect.fn("deleteGoal")(function* (userId: string, id: string) {
  yield* decodeInput(Id)(id);
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      yield* findGoal(tx, userId, id, true);
      yield* deleteActivityFor(tx, "goal", id);
      yield* tx.delete(Goals).where(and(eq(Goals.id, id), eq(Goals.userId, userId)));
      return id;
    }),
  );
});

/** The title of the user's habit or task, failing when it isn't theirs. */
const findItemTitle = (tx: Executor, userId: string, itemType: GoalLinkItem, itemId: string) =>
  Effect.gen(function* () {
    if (itemType === "task") {
      const [task] = yield* tx
        .select({ title: Tasks.title })
        .from(Tasks)
        .where(and(eq(Tasks.id, itemId), eq(Tasks.userId, userId)));
      if (!task) return yield* new TaskNotFound({ message: "That task no longer exists.", id: itemId });
      return task.title;
    }
    const [habit] = yield* tx
      .select({ title: Habits.title })
      .from(Habits)
      .where(and(eq(Habits.id, itemId), eq(Habits.userId, userId)));
    if (!habit) return yield* new HabitNotFound({ message: "That habit no longer exists.", id: itemId });
    return habit.title;
  });

/**
 * Links one of the user's habits or tasks to a count goal, or changes the
 * amount of an existing link. Past taps and settles aren't counted: the link
 * moves the goal from now on.
 */
export const linkItem = Effect.fn("linkGoalItem")(function* (userId: string, input: LinkGoalItemInput) {
  const { goalId, itemType, itemId, amount = 1 } = yield* decodeInput(LinkGoalItemInput)(input);
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const goal = yield* findGoal(tx, userId, goalId, true);
      if (goal.progressMode !== "count") {
        return yield* invalid("Only count goals can link habits and tasks. Switch this goal to a count first.");
      }
      const title = yield* findItemTitle(tx, userId, itemType, itemId);
      const links = yield* tx
        .select({ itemType: GoalLinks.itemType, itemId: GoalLinks.itemId })
        .from(GoalLinks)
        .where(eq(GoalLinks.goalId, goalId));
      const exists = links.some((l) => l.itemType === itemType && l.itemId === itemId);
      if (!exists && links.length >= GOAL_LINKS_MAX) {
        return yield* invalid(`A goal can link at most ${GOAL_LINKS_MAX} habits and tasks.`);
      }
      const [row] = yield* tx
        .insert(GoalLinks)
        .values({ id: newId(), goalId, userId, itemType, itemId, amount, createdAt: new Date() })
        .onConflictDoUpdate({
          target: [GoalLinks.goalId, GoalLinks.itemType, GoalLinks.itemId],
          set: { amount },
        })
        .returning();
      return toLink(row!, title);
    }),
  );
});

/** Unlinks a habit or task; the progress it added stays. Unlinking what isn't linked does nothing. */
export const unlinkItem = Effect.fn("unlinkGoalItem")(function* (userId: string, input: UnlinkGoalItemInput) {
  const { goalId, itemType, itemId } = yield* decodeInput(UnlinkGoalItemInput)(input);
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      yield* findGoal(tx, userId, goalId, true);
      yield* tx
        .delete(GoalLinks)
        .where(
          and(
            eq(GoalLinks.goalId, goalId),
            eq(GoalLinks.userId, userId),
            eq(GoalLinks.itemType, itemType),
            eq(GoalLinks.itemId, itemId),
          ),
        );
    }),
  );
});

// ─── Reads ───────────────────────────────────────────────────────────────────

/** Links per goal id, oldest first, with their items' titles. */
const loadLinks = (tx: Executor, userId: string, goalIds: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const byGoal = new Map<string, Array<GoalLink>>();
    if (goalIds.length === 0) return byGoal;
    const rows = yield* tx
      .select({ link: GoalLinks, taskTitle: Tasks.title, habitTitle: Habits.title })
      .from(GoalLinks)
      .leftJoin(Tasks, and(eq(GoalLinks.itemType, "task"), eq(Tasks.id, GoalLinks.itemId)))
      .leftJoin(Habits, and(eq(GoalLinks.itemType, "habit"), eq(Habits.id, GoalLinks.itemId)))
      .where(and(eq(GoalLinks.userId, userId), inArray(GoalLinks.goalId, [...goalIds])))
      .orderBy(asc(GoalLinks.createdAt), asc(GoalLinks.id));
    for (const { link, taskTitle, habitTitle } of rows) {
      const list = byGoal.get(link.goalId) ?? [];
      list.push(toLink(link, taskTitle ?? habitTitle ?? ""));
      byGoal.set(link.goalId, list);
    }
    return byGoal;
  });

/** The latest `limit` progress events per goal id, newest first. */
const loadEvents = (tx: Executor, userId: string, goalIds: ReadonlyArray<string>, limit: number) =>
  Effect.gen(function* () {
    const byGoal = new Map<string, Array<GoalProgressEvent>>();
    if (goalIds.length === 0) return byGoal;
    const ranked = tx
      .select({
        id: GoalProgressEvents.id,
        goalId: GoalProgressEvents.goalId,
        userId: GoalProgressEvents.userId,
        delta: GoalProgressEvents.delta,
        valueAfter: GoalProgressEvents.valueAfter,
        source: GoalProgressEvents.source,
        sourceId: GoalProgressEvents.sourceId,
        sourceDate: GoalProgressEvents.sourceDate,
        createdAt: GoalProgressEvents.createdAt,
        rank: sql<number>`row_number() over (partition by ${GoalProgressEvents.goalId} order by ${GoalProgressEvents.createdAt} desc, ${GoalProgressEvents.id} desc)`.as(
          "rank",
        ),
      })
      .from(GoalProgressEvents)
      .where(and(eq(GoalProgressEvents.userId, userId), inArray(GoalProgressEvents.goalId, [...goalIds])))
      .as("ranked");
    // The subquery's columns go by name: this drizzle-orm build renders
    // `ranked.rank` and friends as empty in `where` and `order by`.
    const rows = yield* tx
      .select()
      .from(ranked)
      .where(sql`${sql.identifier("rank")} <= ${limit}`)
      .orderBy(sql`${sql.identifier("created_at")} desc`, sql`${sql.identifier("id")} desc`);
    for (const { rank: _, ...row } of rows) {
      const list = byGoal.get(row.goalId) ?? [];
      list.push(toEvent(row));
      byGoal.set(row.goalId, list);
    }
    return byGoal;
  });

const summaries = (tx: Executor, userId: string, goals: ReadonlyArray<GoalRow>, eventLimit: number) =>
  Effect.gen(function* () {
    const ids = goals.map((g) => g.id);
    const links = yield* loadLinks(tx, userId, ids);
    const events = yield* loadEvents(tx, userId, ids, eventLimit);
    return goals.map(
      (goal) =>
        new GoalSummary({
          goal: toGoal(goal),
          links: links.get(goal.id) ?? [],
          events: events.get(goal.id) ?? [],
        }),
    );
  });

export const getGoal = Effect.fn("getGoal")(function* (userId: string, id: string) {
  yield* decodeInput(Id)(id);
  const db = yield* Database;
  return yield* Effect.gen(function* () {
    const goal = yield* findGoal(db, userId, id);
    const [summary] = yield* summaries(db, userId, [goal], GOAL_EVENTS_IN_DETAIL);
    return summary!;
  }).pipe(orDieOnDbError);
});

/**
 * `/now`'s goals on `date`: active goals created on or before it, and the
 * goals completed that day (both in the user's zone), oldest first. Paused
 * goals are left out.
 */
export const listGoalsForDay = Effect.fn("listGoalsForDay")(function* (userId: string, date: LocalDate) {
  const day = yield* decodeInput(LocalDate)(date);
  const db = yield* Database;
  return yield* Effect.gen(function* () {
    const { timeZone } = yield* userSettings(db, userId);
    const localDay = (column: typeof Goals.createdAt | typeof Goals.completedAt) => sql`(${column} at time zone ${timeZone})::date`;
    const rows = yield* db
      .select()
      .from(Goals)
      .where(
        and(
          eq(Goals.userId, userId),
          or(
            and(eq(Goals.status, "active"), sql`${localDay(Goals.createdAt)} <= ${day}`),
            and(eq(Goals.status, "completed"), sql`${localDay(Goals.completedAt)} = ${day}`),
          ),
        ),
      )
      .orderBy(asc(Goals.createdAt), asc(Goals.id));
    return new GoalsForDay({
      date: day,
      active: rows.filter((g) => g.status === "active").map(toGoal),
      completed: rows.filter((g) => g.status === "completed").map(toGoal),
    });
  }).pipe(orDieOnDbError);
});

/** Upcoming's goals: active ones whose target date is in `[from, last]`, by target date. */
export const listGoalsDueBetween = (userId: string, from: LocalDate, last: LocalDate) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db
      .select()
      .from(Goals)
      .where(
        and(
          eq(Goals.userId, userId),
          eq(Goals.status, "active"),
          gte(Goals.targetDate, from),
          lte(Goals.targetDate, last),
        ),
      )
      .orderBy(asc(Goals.targetDate), asc(Goals.createdAt), asc(Goals.id))
      .pipe(orDieOnDbError);
    return rows.map(toGoal);
  });

/** `/goals`: the user's goals, oldest first, each with its links and latest progress events. */
export const listGoals = Effect.fn("listGoals")(function* (userId: string, input: ListGoalsInput) {
  const { status } = yield* decodeInput(ListGoalsInput)(input);
  const db = yield* Database;
  return yield* Effect.gen(function* () {
    const goals = yield* db
      .select()
      .from(Goals)
      .where(and(eq(Goals.userId, userId), status?.length ? inArray(Goals.status, [...status]) : undefined))
      .orderBy(asc(Goals.createdAt), asc(Goals.id));
    return yield* summaries(db, userId, goals, GOAL_EVENTS_IN_LIST);
  }).pipe(orDieOnDbError);
});

/** The goals a habit or task is linked to, oldest link first. */
export const listItemGoals = Effect.fn("listItemGoals")(function* (userId: string, input: GoalItemRef) {
  const { itemType, itemId } = yield* decodeInput(GoalItemRef)(input);
  const db = yield* Database;
  return yield* Effect.gen(function* () {
    const rows = yield* db
      .select({ goal: Goals, link: GoalLinks })
      .from(GoalLinks)
      .innerJoin(Goals, eq(Goals.id, GoalLinks.goalId))
      .where(
        and(eq(GoalLinks.userId, userId), eq(GoalLinks.itemType, itemType), eq(GoalLinks.itemId, itemId)),
      )
      .orderBy(asc(GoalLinks.createdAt), asc(GoalLinks.id));
    if (rows.length === 0) return [];
    const title = yield* findItemTitle(db, userId, itemType, itemId).pipe(Effect.orElseSucceed(() => ""));
    return rows.map(({ goal, link }) => new ItemGoal({ goal: toGoal(goal), link: toLink(link, title) }));
  }).pipe(orDieOnDbError);
});

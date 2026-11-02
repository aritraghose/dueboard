import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, lte, ne, or, type SQL } from "drizzle-orm";
import * as Effect from "effect/Effect";
import { Activity, Tasks, UserSettings, type TaskRow } from "../schema.ts";
import { deleteActivityFor, recordActivity } from "./activity.ts";
import { LocalDate } from "./dates.ts";
import { Database, newId, orDieOnDbError, transaction, type Executor } from "./database.ts";
import { deleteLinksFor, onTaskSettled, onTaskUnsettled } from "./goals.ts";
import {
  CreateTaskInput,
  DayTask,
  Id,
  InvalidInput,
  ListTasksInput,
  ListUnscheduledTasksInput,
  SetTaskStatusInput,
  TASK_PAGE_SIZE_DEFAULT,
  Task,
  TaskNotFound,
  TaskPage,
  TasksForDay,
  UnscheduledTasks,
  UpdateTaskInput,
  decodeInput,
} from "./model.ts";
import { findDefaultTag, findTag } from "./tags.ts";
import {
  dateRoleOn,
  decodeTaskCursor,
  encodeTaskCursor,
  mergePatch,
  statusTransition,
  taskDatesError,
  titleSearchPattern,
} from "./tasks-rules.ts";

// The user's tasks (planning.md "Tasks", architecture.md §4). A task shows
// on its assigned date, its deadline date, or both; with neither it's
// "unscheduled". Settling one records a `task_settled` activity in the same
// transaction, and un-settling or deleting it removes that row. Goals
// linked to the task move with it (`goals.ts`), in the same transaction.

export const toTask = (row: TaskRow): Task =>
  new Task({
    id: row.id,
    title: row.title,
    description: row.description,
    assignedDate: row.assignedDate,
    deadlineDate: row.deadlineDate,
    tagId: row.tagId,
    status: row.status,
    settledAt: row.settledAt,
    privacy: row.privacy,
    shareToLive: row.shareToLive,
    importance: row.importance,
    expectedMinutes: row.expectedMinutes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

const notFound = (id: string) => new TaskNotFound({ message: "That task no longer exists.", id });

const checkDates = (dates: Pick<TaskRow, "assignedDate" | "deadlineDate">) => {
  const message = taskDatesError(dates);
  return message ? Effect.fail(new InvalidInput({ message })) : Effect.void;
};

/** One of the user's tasks, locked for the rest of the transaction when `lock` is set. */
const findTask = (tx: Executor, userId: string, id: string, lock = false) =>
  Effect.gen(function* () {
    const query = tx
      .select()
      .from(Tasks)
      .where(and(eq(Tasks.id, id), eq(Tasks.userId, userId)));
    const [row] = yield* lock ? query.for("update") : query;
    if (!row) return yield* notFound(id);
    return row;
  });

// ─── Writes ──────────────────────────────────────────────────────────────────

export const createTask = Effect.fn("createTask")(function* (
  userId: string,
  input: CreateTaskInput,
) {
  const values = yield* decodeInput(CreateTaskInput)(input);
  const assignedDate = values.assignedDate ?? null;
  const deadlineDate = values.deadlineDate ?? null;
  yield* checkDates({ assignedDate, deadlineDate });
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const tag = values.tagId
        ? yield* findTag(tx, userId, values.tagId)
        : yield* findDefaultTag(tx, userId);
      const [settings] = yield* tx
        .select({
          defaultPrivacy: UserSettings.defaultPrivacy,
          defaultShareToLive: UserSettings.defaultShareToLive,
        })
        .from(UserSettings)
        .where(eq(UserSettings.userId, userId));
      // `Bootstrap` creates the row on every app load, so a missing one is a bug.
      if (!settings) return yield* Effect.die(new Error(`User ${userId} has no settings`));
      // Set from JS rather than `now()`, so `created_at` has millisecond
      // precision and `ListTasks` cursors (which go through `Date`) are exact.
      const now = new Date();
      const [row] = yield* tx
        .insert(Tasks)
        .values({
          id: newId(),
          userId,
          title: values.title,
          description: values.description ?? null,
          assignedDate,
          deadlineDate,
          tagId: tag.id,
          privacy: values.privacy ?? settings.defaultPrivacy,
          shareToLive: values.shareToLive ?? settings.defaultShareToLive,
          importance: values.importance ?? null,
          expectedMinutes: values.expectedMinutes ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return toTask(row!);
    }),
  );
});

/**
 * Changes the fields `input` names: a missing key is left as it is, and
 * `null` clears an optional field. The dates rule is checked against the
 * merged values.
 */
export const updateTask = Effect.fn("updateTask")(function* (
  userId: string,
  input: UpdateTaskInput,
) {
  const { id, ...patch } = yield* decodeInput(UpdateTaskInput)(input);
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const current = yield* findTask(tx, userId, id, true);
      if (Object.keys(patch).length === 0) return toTask(current);
      yield* checkDates(mergePatch(current, patch));
      if (patch.tagId !== undefined && patch.tagId !== current.tagId) {
        yield* findTag(tx, userId, patch.tagId);
      }
      const [row] = yield* tx
        .update(Tasks)
        .set(patch)
        .where(and(eq(Tasks.id, id), eq(Tasks.userId, userId)))
        .returning();
      return toTask(row!);
    }),
  );
});

/**
 * Moves a task to `status`. Settling sets `settled_at` and records a
 * `task_settled` activity; leaving `settled` clears both. `idle` ⇄ `working`
 * only relabels.
 */
export const setTaskStatus = Effect.fn("setTaskStatus")(function* (
  userId: string,
  input: SetTaskStatusInput,
) {
  const { id, status } = yield* decodeInput(SetTaskStatusInput)(input);
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const current = yield* findTask(tx, userId, id, true);
      const transition = statusTransition(current.status, status);
      if (transition === "unchanged") return toTask(current);
      const now = new Date();
      const [row] = yield* tx
        .update(Tasks)
        .set({ status, settledAt: transition === "settle" ? now : null })
        .where(and(eq(Tasks.id, id), eq(Tasks.userId, userId)))
        .returning();
      const task = row!;
      if (transition === "settle") {
        yield* recordActivity(tx, {
          userId,
          kind: "task_settled",
          subjectType: "task",
          subjectId: id,
          occurredAt: now,
        });
        yield* onTaskSettled(tx, userId, task);
      } else if (transition === "unsettle") {
        yield* deleteActivityFor(tx, "task", id, "task_settled");
        yield* onTaskUnsettled(tx, userId, task);
      }
      return toTask(task);
    }),
  );
});

/**
 * Deletes a task, its activity and its goal links. A settled task's goals
 * lose what it added first. Returns the id.
 */
export const deleteTask = Effect.fn("deleteTask")(function* (userId: string, id: string) {
  yield* decodeInput(Id)(id);
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const current = yield* findTask(tx, userId, id, true);
      if (current.status === "settled") yield* onTaskUnsettled(tx, userId, current);
      yield* deleteLinksFor(tx, userId, "task", id);
      yield* deleteActivityFor(tx, "task", id);
      yield* tx.delete(Tasks).where(and(eq(Tasks.id, id), eq(Tasks.userId, userId)));
      return id;
    }),
  );
});

// ─── Reads ───────────────────────────────────────────────────────────────────

export const getTask = Effect.fn("getTask")(function* (userId: string, id: string) {
  yield* decodeInput(Id)(id);
  const db = yield* Database;
  return toTask(yield* findTask(db, userId, id).pipe(orDieOnDbError));
});

/**
 * The tasks whose assigned or deadline date is `date`, split into open and
 * settled, each with the date roles that apply. Overdue tasks are not
 * carried over.
 */
export const listTasksForDay = Effect.fn("listTasksForDay")(function* (
  userId: string,
  date: LocalDate,
) {
  const day = yield* decodeInput(LocalDate)(date);
  const db = yield* Database;
  const rows = yield* db
    .select()
    .from(Tasks)
    .where(
      and(eq(Tasks.userId, userId), or(eq(Tasks.assignedDate, day), eq(Tasks.deadlineDate, day))),
    )
    .orderBy(asc(Tasks.createdAt), asc(Tasks.id))
    .pipe(orDieOnDbError);
  const open: Array<DayTask> = [];
  const settled: Array<DayTask> = [];
  for (const row of rows) {
    const entry = new DayTask({ task: toTask(row), role: dateRoleOn(row, day)! });
    (row.status === "settled" ? settled : open).push(entry);
  }
  settled.sort((a, b) => b.task.settledAt!.getTime() - a.task.settledAt!.getTime());
  return new TasksForDay({ date: day, open, settled });
});

const unscheduled = and(isNull(Tasks.assignedDate), isNull(Tasks.deadlineDate));

/**
 * Open tasks with no dates, oldest first. With `settledOn`, also the
 * unscheduled tasks settled on that day in the user's zone (the day of
 * their `task_settled` activity), most recent first.
 */
export const listUnscheduledTasks = Effect.fn("listUnscheduledTasks")(function* (
  userId: string,
  input: ListUnscheduledTasksInput,
) {
  const { settledOn } = yield* decodeInput(ListUnscheduledTasksInput)(input);
  const db = yield* Database;
  const open = yield* db
    .select()
    .from(Tasks)
    .where(and(eq(Tasks.userId, userId), unscheduled, ne(Tasks.status, "settled")))
    .orderBy(asc(Tasks.createdAt), asc(Tasks.id))
    .pipe(orDieOnDbError);
  const settled = settledOn
    ? yield* db
        .select({ task: Tasks })
        .from(Tasks)
        .innerJoin(
          Activity,
          and(
            eq(Activity.subjectId, Tasks.id),
            eq(Activity.subjectType, "task"),
            eq(Activity.kind, "task_settled"),
            eq(Activity.userId, userId),
          ),
        )
        .where(
          and(
            eq(Tasks.userId, userId),
            unscheduled,
            eq(Tasks.status, "settled"),
            eq(Activity.localDate, settledOn),
          ),
        )
        .orderBy(desc(Tasks.settledAt))
        .pipe(orDieOnDbError)
    : [];
  return new UnscheduledTasks({
    open: open.map(toTask),
    settled: settled.map(({ task }) => toTask(task)),
  });
});

/** `/tasks`: the user's tasks, newest first, filtered and paginated by cursor. */
export const listTasks = Effect.fn("listTasks")(function* (userId: string, input: ListTasksInput) {
  const filters = yield* decodeInput(ListTasksInput)(input);
  const { from, to } = filters;
  if (from && to && from > to) {
    return yield* new InvalidInput({ message: "The range's start can't be after its end." });
  }
  const cursor = filters.cursor === undefined ? undefined : decodeTaskCursor(filters.cursor);
  if (cursor === null) {
    return yield* new InvalidInput({ message: "That page link is invalid. Reload the list." });
  }
  const inRange = (column: typeof Tasks.assignedDate) =>
    and(from ? gte(column, from) : undefined, to ? lte(column, to) : undefined);
  const pattern = filters.query === undefined ? null : titleSearchPattern(filters.query);
  const conditions: Array<SQL | undefined> = [
    eq(Tasks.userId, userId),
    filters.status?.length ? inArray(Tasks.status, [...filters.status]) : undefined,
    filters.tagId ? eq(Tasks.tagId, filters.tagId) : undefined,
    from || to ? or(inRange(Tasks.assignedDate), inRange(Tasks.deadlineDate)) : undefined,
    pattern ? ilike(Tasks.title, pattern) : undefined,
    cursor
      ? or(
          lt(Tasks.createdAt, cursor.createdAt),
          and(eq(Tasks.createdAt, cursor.createdAt), lt(Tasks.id, cursor.id)),
        )
      : undefined,
  ];
  const limit = filters.limit ?? TASK_PAGE_SIZE_DEFAULT;
  const db = yield* Database;
  const rows = yield* db
    .select()
    .from(Tasks)
    .where(and(...conditions))
    .orderBy(desc(Tasks.createdAt), desc(Tasks.id))
    .limit(limit + 1)
    .pipe(orDieOnDbError);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return new TaskPage({
    tasks: page.map(toTask),
    nextCursor: rows.length > limit && last ? encodeTaskCursor(last) : null,
  });
});

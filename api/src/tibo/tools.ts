// Tibo's tools (architecture.md §7.4): everything the user can do in the
// app, done as that user through the DomainWorker, which runs the same RPC
// handlers as the UI. Every call passes the agent's own user id; no tool
// takes a user id from the model.
//
// Tools answer with short JSON the model reads back. Failures are answers
// too (`{ error }`), never thrown, so the model can explain or retry. Changes
// leave a receipt on the turn (`TurnLedger`); destructive or surprising ones
// are held for the user instead (`./actions.ts` has the design).

import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { DomainBinding, DomainResult, TiboRpc } from "../domain-client.ts";
import { BULK_LIMIT, MAX_TOOL_CALLS, receiptFor, type DomainCall, type TurnLedger } from "./actions.ts";
import { dayLabel } from "./dates.ts";
import { TIBO_MEMORY_KINDS, type TiboMemoryKind } from "./protocol.ts";
import { REMINDER_MESSAGE_MAX } from "./reminders.ts";
import {
  IMPORTANCE,
  goalView,
  habitView,
  importanceValue,
  minutesLabel,
  noteView,
  sessionView,
  taskReceipt,
  taskStatusOf,
  taskView,
  type DayTaskJson,
  type DiaryPageJson,
  type GoalJson,
  type GoalSummaryJson,
  type HabitJson,
  type HabitOnDayJson,
  type HabitSummaryJson,
  type LiveEventJson,
  type NoteJson,
  type SessionJson,
  type TagJson,
  type TaskJson,
} from "./views.ts";

/** What the tools act with, for one turn. */
export interface ToolRuntime {
  readonly domain: DomainBinding;
  /** The agent's own user: the only user Tibo acts as. */
  readonly userId: string;
  readonly timeZone: string;
  /** Today in the user's zone, `YYYY-MM-DD`. */
  readonly today: string;
  readonly ledger: TurnLedger;
  /**
   * Answers the pending action from `confirm_action`. Only offered when the
   * turn was started by a message the user typed after the action was held.
   */
  readonly confirmPending: ((approve: boolean) => Promise<unknown>) | null;
  /** Long-term memory (`./recall.ts`), bound to this turn by the agent. */
  readonly memory: MemoryTools;
  /** Reminders the user asks for (`./reminders.ts`), bound to this turn by the agent. */
  readonly reminders: ReminderTools;
}

/** The reminder tools' backends. Their answers go to the model as they are. */
export interface ReminderTools {
  set(input: { date: string; time: string; about: string; message: string }): Promise<unknown>;
  list(): Promise<unknown>;
  cancel(input: { id: string }): Promise<unknown>;
}

/** The memory tools' backends. Their answers go to the model as they are. */
export interface MemoryTools {
  search(input: { query: string; from?: string; to?: string }): Promise<unknown>;
  remember(input: { text: string; kind: TiboMemoryKind; replaces: readonly string[] }): Promise<unknown>;
  forget(input: { refs: readonly string[]; about?: string }): Promise<unknown>;
}

// ─── Reactivity keys of the app's lists (`web/src/hooks/use-*.ts`) ─────────

const TASKS = ["tasks"];
const HABITS = ["habits"];
const GOALS = ["goals"];
const NOTES = ["notes"];
const SESSIONS = ["sessions", "active-session"];
const TAGS = ["tags"];

// ─── Shared schemas ────────────────────────────────────────────────────────

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("A calendar day as YYYY-MM-DD, in the user's time zone");
const id = z.string().min(1).max(64);
const privacy = z
  .enum(["private", "connections", "public"])
  .describe("Who can see it. Leave it out to use the user's default. Public needs the user's go-ahead.");
const importance = z.enum(IMPORTANCE).describe("Importance, as the app's stars: low (1) to critical (5)");

// ─── Running domain calls ──────────────────────────────────────────────────

const NOT_AVAILABLE = "Couldn't reach the app just now. Nothing was changed. Say so and suggest trying again.";

/** One RPC as the user. A broken call comes back as a failure, never a throw. */
const run = async (rt: ToolRuntime, rpc: TiboRpc, payload: unknown): Promise<DomainResult> => {
  try {
    return await rt.domain.run(rt.userId, rpc, payload);
  } catch (error) {
    console.error("Tibo tool call failed", rpc, error);
    return { ok: false, error: { tag: "Unavailable", message: NOT_AVAILABLE } };
  }
};

const failed = (result: Extract<DomainResult, { ok: false }>) => ({
  error: result.error.message,
  code: result.error.tag,
});

/** A read: the view of its value, or the error. */
const read = async <A>(rt: ToolRuntime, rpc: TiboRpc, payload: unknown, view: (value: A) => unknown) => {
  const result = await run(rt, rpc, payload);
  return result.ok ? view(result.value as A) : failed(result);
};

/**
 * A change. Runs now unless it must wait: `hold` says why it always does
 * (delete, stop, public), and past `BULK_LIMIT` changes in one reply
 * anything else waits too. A held change is answered `needs_confirmation`.
 */
const change = async <A>(
  rt: ToolRuntime,
  call: DomainCall & { hold?: boolean; receipt?: (value: A) => string; view?: (value: A) => unknown },
) => {
  const { hold, receipt, view, ...stored } = call;
  if (hold || rt.ledger.overBulkLimit) {
    rt.ledger.held.push(stored);
    return {
      status: "needs_confirmation",
      waiting: call.summary,
      next: hold
        ? "Not done. Tell the user what you're holding and ask them to confirm: they can tap Confirm under your message or just say yes."
        : `Not done: past ${BULK_LIMIT} changes in one reply, the rest wait for the user. Say what's done, list what's waiting, and ask them to confirm.`,
    };
  }
  const result = await run(rt, call.rpc, call.payload);
  if (!result.ok) return failed(result);
  const value = result.value as A;
  rt.ledger.record(receiptFor(stored, value, receipt ? receipt(value) : call.done), call.keys);
  return { status: "done", ...(view ? { result: view(value) } : {}) };
};

/** A tool counted against `MAX_TOOL_CALLS`; past it, the call is refused. */
const counted =
  <I, O>(rt: ToolRuntime, execute: (input: I) => Promise<O>) =>
  async (input: I) => {
    rt.ledger.toolCalls += 1;
    if (rt.ledger.toolCalls > MAX_TOOL_CALLS) {
      return {
        error: "That's the most actions for one reply. Stop here, say what's done and what's left, and offer to keep going.",
      };
    }
    return execute(input);
  };

/** A task by id, for the summaries of held changes. */
const taskById = async (rt: ToolRuntime, taskId: string) => {
  const result = await run(rt, "GetTask", { id: taskId });
  return result.ok ? (result.value as TaskJson) : null;
};

const activeSession = async (rt: ToolRuntime) => {
  const result = await run(rt, "GetActiveSession", undefined);
  return result.ok ? (result.value as SessionJson | null) : undefined;
};

const sessionName = (session: SessionJson) => (session.label ? `“${session.label}”` : "the current session");

const NO_SESSION = { error: "There's no running or paused session." };

/** Every tool, bound to this turn. */
export function tiboTools(rt: ToolRuntime): ToolSet {
  const today = rt.today;
  const when = (date: string | null | undefined) => (date ? dayLabel(date, today) : "No date");

  const tools = {
    // ─── Tasks ───────────────────────────────────────────────────────────
    list_tasks: tool({
      description:
        "Find the user's tasks. Pass `day` for one day's board (tasks on that day or due that day), `unscheduled: true` for tasks with no date, or any of `from`/`to`/`query`/`status` to search everything.",
      inputSchema: z.object({
        day: day.optional(),
        unscheduled: z.boolean().optional(),
        from: day.optional(),
        to: day.optional(),
        query: z.string().max(200).optional().describe("Words in the title"),
        status: z.array(z.enum(["todo", "in_progress", "done"])).optional(),
      }),
      execute: counted(rt, async ({ day: date, unscheduled, from, to, query, status }) => {
        if (date) {
          return read<{ open: DayTaskJson[]; settled: DayTaskJson[] }>(rt, "ListTasksForDay", { date }, (value) => ({
            open: value.open.map(({ task }) => taskView(task)),
            done: value.settled.map(({ task }) => taskView(task)),
          }));
        }
        if (unscheduled) {
          return read<{ open: TaskJson[]; settled: TaskJson[] }>(rt, "ListUnscheduledTasks", {}, (value) => ({
            open: value.open.map(taskView),
          }));
        }
        return read<{ tasks: TaskJson[]; nextCursor: string | null }>(
          rt,
          "ListTasks",
          {
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
            ...(query ? { query } : {}),
            ...(status ? { status: status.map(taskStatusOf) } : {}),
            limit: 30,
          },
          (value) => ({ tasks: value.tasks.map(taskView), more: value.nextCursor !== null }),
        );
      }),
    }),

    create_task: tool({
      description:
        "Create a task. `date` is the day to do it; `deadline` the day it's due (either, both or neither). Without `importance` it has none.",
      inputSchema: z.object({
        title: z.string().trim().min(1).max(200),
        date: day.optional(),
        deadline: day.optional(),
        importance: importance.optional(),
        minutes: z.number().int().min(1).max(1440).optional().describe("Expected minutes"),
        notes: z.string().max(2000).optional(),
        tagId: id.optional().describe("From list_tags; leave out for the default tag"),
        privacy: privacy.optional(),
      }),
      execute: counted(rt, (input) =>
        change<TaskJson>(rt, {
          rpc: "CreateTask",
          payload: {
            title: input.title,
            ...(input.date ? { assignedDate: input.date } : {}),
            ...(input.deadline ? { deadlineDate: input.deadline } : {}),
            ...(input.importance ? { importance: importanceValue(input.importance) } : {}),
            ...(input.minutes ? { expectedMinutes: input.minutes } : {}),
            ...(input.notes ? { description: input.notes } : {}),
            ...(input.tagId ? { tagId: input.tagId } : {}),
            ...(input.privacy ? { privacy: input.privacy } : {}),
          },
          summary: `Create task: ${taskReceipt(input.title, input.date, input.deadline, today)}`,
          verb: "Created",
          item: { kind: "task", title: input.title },
          done: `Created task: ${taskReceipt(input.title, input.date, input.deadline, today)}`,
          keys: TASKS,
          hold: input.privacy === "public",
          view: taskView,
        }),
      ),
    }),

    update_task: tool({
      description:
        "Change a task's details. Only the fields you pass change; pass `null` to clear a date, importance, minutes or notes. Status changes go through set_task_status.",
      inputSchema: z.object({
        id,
        title: z.string().trim().min(1).max(200).optional(),
        date: day.nullable().optional(),
        deadline: day.nullable().optional(),
        importance: importance.nullable().optional(),
        minutes: z.number().int().min(1).max(1440).nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
        tagId: id.optional(),
        privacy: privacy.optional(),
      }),
      execute: counted(rt, async (input) => {
        const task = await taskById(rt, input.id);
        if (!task) return { error: "No task with that id. List tasks to find it." };
        const title = input.title ?? task.title;
        return change<TaskJson>(rt, {
          rpc: "UpdateTask",
          payload: {
            id: input.id,
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.date !== undefined ? { assignedDate: input.date } : {}),
            ...(input.deadline !== undefined ? { deadlineDate: input.deadline } : {}),
            ...(input.importance !== undefined
              ? { importance: input.importance === null ? null : importanceValue(input.importance) }
              : {}),
            ...(input.minutes !== undefined ? { expectedMinutes: input.minutes } : {}),
            ...(input.notes !== undefined ? { description: input.notes } : {}),
            ...(input.tagId !== undefined ? { tagId: input.tagId } : {}),
            ...(input.privacy !== undefined ? { privacy: input.privacy } : {}),
          },
          summary: `Update task: ${title}${input.privacy === "public" ? " (make it public)" : ""}`,
          verb: "Updated",
          item: { kind: "task", id: input.id, title },
          done: `Updated task: ${title}`,
          keys: TASKS,
          hold: input.privacy === "public" && task.privacy !== "public",
          receipt: (value) => `Updated task: ${taskReceipt(value.title, value.assignedDate, value.deadlineDate, today)}`,
          view: taskView,
        });
      }),
    }),

    set_task_status: tool({
      description: "Mark a task todo, in_progress or done.",
      inputSchema: z.object({ id, status: z.enum(["todo", "in_progress", "done"]) }),
      execute: counted(rt, async ({ id: taskId, status }) => {
        const task = await taskById(rt, taskId);
        if (!task) return { error: "No task with that id. List tasks to find it." };
        const verb = status === "done" ? "Done" : status === "in_progress" ? "Started" : "Reopened";
        return change<TaskJson>(rt, {
          rpc: "SetTaskStatus",
          payload: { id: taskId, status: taskStatusOf(status) },
          summary: `Mark ${status.replace("_", " ")}: ${task.title}`,
          verb,
          item: { kind: "task", id: taskId, title: task.title },
          done: `${verb}: ${task.title}`,
          keys: TASKS,
          view: taskView,
        });
      }),
    }),

    delete_task: tool({
      description: "Delete a task for good. Always waits for the user's go-ahead.",
      inputSchema: z.object({ id }),
      execute: counted(rt, async ({ id: taskId }) => {
        const task = await taskById(rt, taskId);
        if (!task) return { error: "No task with that id. List tasks to find it." };
        return change(rt, {
          rpc: "DeleteTask",
          payload: { id: taskId },
          summary: `Delete task: ${task.title}`,
          verb: "Deleted",
          item: { kind: "task", id: taskId, title: task.title },
          done: `Deleted task: ${task.title}`,
          keys: TASKS,
          hold: true,
        });
      }),
    }),

    // ─── Habits ──────────────────────────────────────────────────────────
    list_habits: tool({
      description:
        "The user's habits for a day (default today): which are due, done, or not due, with progress this period. `all: true` lists every habit instead, paused ones too.",
      inputSchema: z.object({ day: day.optional(), all: z.boolean().optional() }),
      execute: counted(rt, ({ day: date, all }) =>
        all
          ? read<HabitSummaryJson[]>(rt, "ListHabits", undefined, (value) => ({ habits: value.map(habitView) }))
          : read<{ due: HabitOnDayJson[]; settled: HabitOnDayJson[] }>(
              rt,
              "ListHabitsForDay",
              { date: date ?? today },
              (value) => ({ due: value.due.map(habitView), doneOrNotDue: value.settled.map(habitView) }),
            ),
      ),
    }),

    create_habit: tool({
      description:
        "Create a habit. Flexible: `targetCount` times per `periodLength` `periodUnit`s (3 times a week = kind flexible, targetCount 3, periodUnit week, periodLength 1). Specific days: kind specific_days with `weekdays` (0 = Sunday … 6 = Saturday) or `monthDays` (1–31), and targetCount per day (usually 1). The answer has the schedule in words: read it back to the user.",
      inputSchema: z.object({
        title: z.string().trim().min(1).max(200),
        kind: z.enum(["flexible", "specific_days"]),
        targetCount: z.number().int().min(1).max(100),
        periodUnit: z.enum(["day", "week", "month"]).optional(),
        periodLength: z.number().int().min(1).max(365).optional(),
        weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
        monthDays: z.array(z.number().int().min(1).max(31)).max(31).optional(),
        startDate: day.optional().describe("Defaults to today"),
        privacy: privacy.optional(),
      }),
      execute: counted(rt, async (input) => {
        const schedule = {
          kind: input.kind,
          targetCount: input.targetCount,
          ...(input.periodUnit ? { periodUnit: input.periodUnit } : {}),
          ...(input.periodLength ? { periodLength: input.periodLength } : {}),
          ...(input.weekdays ? { weekdays: input.weekdays } : {}),
          ...(input.monthDays ? { monthDays: input.monthDays } : {}),
        };
        const created = await change<HabitJson>(rt, {
          rpc: "CreateHabit",
          payload: {
            title: input.title,
            schedule,
            ...(input.startDate ? { startDate: input.startDate } : {}),
            ...(input.privacy ? { privacy: input.privacy } : {}),
          },
          summary: `Create habit: ${input.title}`,
          verb: "Created",
          item: { kind: "habit", title: input.title },
          done: `Created habit: ${input.title}`,
          keys: HABITS,
          hold: input.privacy === "public",
          view: (habit) => habit,
        });
        if (!("result" in created)) return created;
        // The schedule in the app's own words, to read back.
        const habit = created.result as HabitJson;
        const summary = await run(rt, "GetHabit", { id: habit.id });
        if (!summary.ok) return { status: "done", result: { id: habit.id, title: habit.title } };
        const view = habitView(summary.value as HabitSummaryJson);
        const receipt = rt.ledger.receipts.at(-1);
        if (receipt) rt.ledger.receipts[rt.ledger.receipts.length - 1] = { ...receipt, text: `${receipt.text} · ${view.schedule}` };
        return { status: "done", result: view };
      }),
    }),

    check_in_habit: tool({
      description: "Check a habit in (one tap) for a day: today by default, or up to 30 days back.",
      inputSchema: z.object({ id, day: day.optional() }),
      execute: counted(rt, ({ id: habitId, day: date }) =>
        change<HabitOnDayJson>(rt, {
          rpc: "CheckInHabit",
          payload: { id: habitId, date: date ?? today },
          summary: "Check in a habit",
          verb: "Checked in",
          item: { kind: "habit", id: habitId },
          done: "Checked in a habit",
          keys: HABITS,
          receipt: (value) =>
            `Checked in: ${value.habit.title} · ${value.progress.done}/${value.progress.target}${date && date !== today ? ` · ${when(date)}` : ""}`,
          view: habitView,
        }),
      ),
    }),

    undo_check_in: tool({
      description: "Take back one check-in of a habit for a day (today by default).",
      inputSchema: z.object({ id, day: day.optional() }),
      execute: counted(rt, ({ id: habitId, day: date }) =>
        change<HabitOnDayJson>(rt, {
          rpc: "UndoCheckInHabit",
          payload: { id: habitId, date: date ?? today },
          summary: "Undo a habit check-in",
          verb: "Undid check-in",
          item: { kind: "habit", id: habitId },
          done: "Undid a habit check-in",
          keys: HABITS,
          receipt: (value) => `Undid check-in: ${value.habit.title}`,
          view: habitView,
        }),
      ),
    }),

    pause_habit: tool({
      description: "Pause a habit: it stops being due until resumed.",
      inputSchema: z.object({ id }),
      execute: counted(rt, ({ id: habitId }) =>
        change<HabitJson>(rt, {
          rpc: "PauseHabit",
          payload: { id: habitId },
          summary: "Pause a habit",
          verb: "Paused",
          item: { kind: "habit", id: habitId },
          done: "Paused a habit",
          keys: HABITS,
          receipt: (value) => `Paused habit: ${value.title}`,
        }),
      ),
    }),

    resume_habit: tool({
      description: "Resume a paused habit.",
      inputSchema: z.object({ id }),
      execute: counted(rt, ({ id: habitId }) =>
        change<HabitJson>(rt, {
          rpc: "ResumeHabit",
          payload: { id: habitId },
          summary: "Resume a habit",
          verb: "Resumed",
          item: { kind: "habit", id: habitId },
          done: "Resumed a habit",
          keys: HABITS,
          receipt: (value) => `Resumed habit: ${value.title}`,
        }),
      ),
    }),

    delete_habit: tool({
      description: "Delete a habit and its history for good. Always waits for the user's go-ahead.",
      inputSchema: z.object({ id }),
      execute: counted(rt, async ({ id: habitId }) => {
        const habit = await run(rt, "GetHabit", { id: habitId });
        if (!habit.ok) return failed(habit);
        const { title } = (habit.value as HabitSummaryJson).habit;
        return change(rt, {
          rpc: "DeleteHabit",
          payload: { id: habitId },
          summary: `Delete habit: ${title}`,
          verb: "Deleted",
          item: { kind: "habit", id: habitId, title },
          done: `Deleted habit: ${title}`,
          keys: HABITS,
          hold: true,
        });
      }),
    }),

    // ─── Goals ───────────────────────────────────────────────────────────
    list_goals: tool({
      description: "The user's goals with progress and linked habits and tasks. Filter by status if you like.",
      inputSchema: z.object({ status: z.array(z.enum(["active", "paused", "completed"])).optional() }),
      execute: counted(rt, ({ status }) =>
        read<GoalSummaryJson[]>(rt, "ListGoals", status ? { status } : {}, (value) => ({
          goals: value.map(({ goal, links }) => ({
            ...goalView(goal),
            ...(links.length > 0
              ? { linked: links.map((link) => ({ type: link.itemType, id: link.itemId, title: link.itemTitle, adds: link.amount })) }
              : {}),
          })),
        })),
      ),
    }),

    create_goal: tool({
      description:
        "Create a goal. `percent` goals move 0–100 by hand; `count` goals need `target` and can grow from linked habits and tasks.",
      inputSchema: z.object({
        name: z.string().trim().min(1).max(200),
        mode: z.enum(["percent", "count"]),
        target: z.number().int().min(1).max(1_000_000).optional().describe("Count goals only"),
        start: z.number().min(0).optional().describe("Starting progress: a percent or a count"),
        targetDate: day.optional(),
        privacy: privacy.optional(),
      }),
      execute: counted(rt, (input) =>
        change<GoalJson>(rt, {
          rpc: "CreateGoal",
          payload: {
            name: input.name,
            progressMode: input.mode === "percent" ? "slider" : "count",
            ...(input.target ? { targetCount: input.target } : {}),
            ...(input.start !== undefined ? { value: input.start } : {}),
            ...(input.targetDate ? { targetDate: input.targetDate } : {}),
            ...(input.privacy ? { privacy: input.privacy } : {}),
          },
          summary: `Create goal: ${input.name}`,
          verb: "Created",
          item: { kind: "goal", title: input.name },
          done: `Created goal: ${input.name}${input.targetDate ? ` · by ${when(input.targetDate)}` : ""}`,
          keys: GOALS,
          hold: input.privacy === "public",
          view: goalView,
        }),
      ),
    }),

    set_goal_progress: tool({
      description:
        "Set a goal's progress (`value`: a percent for percent goals, a count for count goals) or move it (`delta`, can be negative). Pass one.",
      inputSchema: z.object({ id, value: z.number().min(0).optional(), delta: z.number().optional() }),
      execute: counted(rt, ({ id: goalId, value, delta }) => {
        if ((value === undefined) === (delta === undefined)) {
          return Promise.resolve<Record<string, unknown>>({ error: "Pass exactly one of value or delta." });
        }
        return change<GoalJson>(rt, {
          rpc: value !== undefined ? "SetGoalProgress" : "AdjustGoalProgress",
          payload: value !== undefined ? { id: goalId, value } : { id: goalId, delta },
          summary: "Update a goal's progress",
          verb: "Progress",
          item: { kind: "goal", id: goalId },
          done: "Updated a goal's progress",
          keys: GOALS,
          receipt: (goal) =>
            `Progress: ${goal.name} · ${goal.progressMode === "count" ? `${goal.currentCount}/${goal.targetCount}` : `${Math.round(goal.progressPercent)}%`}`,
          view: goalView,
        });
      }),
    }),

    link_goal_item: tool({
      description:
        "Link a habit or task to a count goal: each check-in or settle adds `amount` (default 1). Linking again changes the amount.",
      inputSchema: z.object({
        goalId: id,
        itemType: z.enum(["habit", "task"]),
        itemId: id,
        amount: z.number().int().min(1).max(1000).optional(),
      }),
      execute: counted(rt, (input) =>
        change<{ itemTitle: string }>(rt, {
          rpc: "LinkGoalItem",
          payload: input,
          summary: "Link an item to a goal",
          verb: "Linked",
          item: { kind: "goal", id: input.goalId },
          done: "Linked an item to a goal",
          keys: [...GOALS, ...(input.itemType === "habit" ? HABITS : TASKS)],
          receipt: (link) => `Linked to goal: ${link.itemTitle}`,
        }),
      ),
    }),

    unlink_goal_item: tool({
      description: "Remove a habit's or task's link to a goal (the item itself stays).",
      inputSchema: z.object({ goalId: id, itemType: z.enum(["habit", "task"]), itemId: id }),
      execute: counted(rt, (input) =>
        change(rt, {
          rpc: "UnlinkGoalItem",
          payload: input,
          summary: "Unlink an item from a goal",
          verb: "Unlinked",
          item: { kind: "goal", id: input.goalId },
          done: `Unlinked a ${input.itemType} from a goal`,
          keys: [...GOALS, ...(input.itemType === "habit" ? HABITS : TASKS)],
        }),
      ),
    }),

    set_goal_status: tool({
      description: "Pause, resume or reopen (after completing) a goal.",
      inputSchema: z.object({ id, action: z.enum(["pause", "resume", "reopen"]) }),
      execute: counted(rt, ({ id: goalId, action }) =>
        change<GoalJson>(rt, {
          rpc: action === "pause" ? "PauseGoal" : action === "resume" ? "ResumeGoal" : "ReopenGoal",
          payload: { id: goalId },
          summary: `${action[0]?.toUpperCase()}${action.slice(1)} a goal`,
          verb: action === "pause" ? "Paused" : action === "resume" ? "Resumed" : "Reopened",
          item: { kind: "goal", id: goalId },
          done: `${action === "pause" ? "Paused" : action === "resume" ? "Resumed" : "Reopened"} a goal`,
          keys: GOALS,
          receipt: (goal) => `${action === "pause" ? "Paused" : action === "resume" ? "Resumed" : "Reopened"} goal: ${goal.name}`,
          view: goalView,
        }),
      ),
    }),

    delete_goal: tool({
      description: "Delete a goal for good (its linked habits and tasks stay). Always waits for the user's go-ahead.",
      inputSchema: z.object({ id }),
      execute: counted(rt, async ({ id: goalId }) => {
        const goal = await run(rt, "GetGoal", { id: goalId });
        if (!goal.ok) return failed(goal);
        const { name } = (goal.value as GoalSummaryJson).goal;
        return change(rt, {
          rpc: "DeleteGoal",
          payload: { id: goalId },
          summary: `Delete goal: ${name}`,
          verb: "Deleted",
          item: { kind: "goal", id: goalId, title: name },
          done: `Deleted goal: ${name}`,
          keys: GOALS,
          hold: true,
        });
      }),
    }),

    // ─── Notes ───────────────────────────────────────────────────────────
    create_note: tool({
      description: "Write a note for today: one line, at most 60 characters. Notes can only be written for today.",
      inputSchema: z.object({ body: z.string().trim().min(1).max(60), privacy: privacy.optional() }),
      execute: counted(rt, ({ body, privacy: notePrivacy }) =>
        change<NoteJson>(rt, {
          rpc: "CreateNote",
          payload: { body, date: today, ...(notePrivacy ? { privacy: notePrivacy } : {}) },
          summary: `Write note: ${body}`,
          verb: "Wrote",
          item: { kind: "note", title: body },
          done: `Wrote note: ${body}`,
          keys: NOTES,
          hold: notePrivacy === "public",
          view: noteView,
        }),
      ),
    }),

    list_notes: tool({
      description: "The user's notes: one day's (`day`), or a search (`query`, newest first).",
      inputSchema: z.object({ day: day.optional(), query: z.string().max(60).optional() }),
      execute: counted(rt, ({ day: date, query }) =>
        date && !query
          ? read<{ notes: NoteJson[] }>(rt, "ListNotesForDay", { date }, (value) => ({ notes: value.notes.map(noteView) }))
          : read<{ days: { notes: NoteJson[] }[] }>(rt, "ListNotes", { ...(query ? { query } : {}), limit: 30 }, (value) => ({
              notes: value.days.flatMap((noteDay) => noteDay.notes.map(noteView)),
            })),
      ),
    }),

    // ─── Focus sessions ──────────────────────────────────────────────────
    get_active_session: tool({
      description: "The running or paused focus session, if any.",
      inputSchema: z.object({}),
      execute: counted(rt, async () => {
        const session = await activeSession(rt);
        if (session === undefined) return { error: NOT_AVAILABLE };
        return { session: session ? sessionView(session, rt.timeZone) : null };
      }),
    }),

    start_session: tool({
      description:
        "Start a focus session now. If one is already running or paused this fails and tells you about it: ask the user whether to replace it, and only then call again with `replaceActive: true` (which also waits for their go-ahead).",
      inputSchema: z.object({
        minutes: z.number().int().min(1).max(600),
        label: z.string().trim().min(1).max(100).optional(),
        replaceActive: z.boolean().optional(),
        privacy: privacy.optional(),
      }),
      execute: counted(rt, async ({ minutes, label, replaceActive, privacy: sessionPrivacy }) => {
        const name = `${minutesLabel(minutes)} session${label ? `: ${label}` : ""}`;
        const payload = {
          minutes,
          ...(label ? { label } : {}),
          ...(sessionPrivacy ? { privacy: sessionPrivacy } : {}),
          ...(replaceActive ? { replaceActive: true } : {}),
        };
        if (replaceActive) {
          const current = await activeSession(rt);
          if (current) {
            return change(rt, {
              rpc: "StartSession",
              payload,
              summary: `Stop ${sessionName(current)} and start a ${name}`,
              verb: "Started",
              item: { kind: "session", title: label ?? name },
              done: `Started a ${name}`,
              keys: SESSIONS,
              hold: true,
            });
          }
        }
        const started = await change<SessionJson>(rt, {
          rpc: "StartSession",
          payload,
          summary: `Start a ${name}`,
          verb: "Started",
          item: { kind: "session", title: label ?? name },
          done: `Started a ${name}`,
          keys: SESSIONS,
          hold: sessionPrivacy === "public",
          view: (session) => sessionView(session, rt.timeZone),
        });
        if ("code" in started && started.code === "ActiveSessionExists") {
          return { ...started, next: "Another session is active. Ask whether to replace it; don't replace it on your own." };
        }
        return started;
      }),
    }),

    control_session: tool({
      description:
        "Pause, resume or extend (add `minutes`) the active session, or stop it early (stopping waits for the user's go-ahead).",
      inputSchema: z.object({
        action: z.enum(["pause", "resume", "extend", "stop"]),
        minutes: z.number().int().min(1).max(600).optional().describe("For extend"),
      }),
      execute: counted(rt, async ({ action, minutes }) => {
        const session = await activeSession(rt);
        if (session === undefined) return { error: NOT_AVAILABLE };
        if (!session) return NO_SESSION;
        const name = sessionName(session);
        if (action === "extend" && !minutes) return { error: "Say how many minutes to add." };
        const spec: { rpc: TiboRpc; summary: string; done: string; verb: string } = {
          pause: { rpc: "PauseSession" as const, summary: `Pause ${name}`, done: `Paused ${name}`, verb: "Paused" },
          resume: { rpc: "ResumeSession" as const, summary: `Resume ${name}`, done: `Resumed ${name}`, verb: "Resumed" },
          extend: {
            rpc: "ExtendSession" as const,
            summary: `Add ${minutesLabel(minutes ?? 0)} to ${name}`,
            done: `Added ${minutesLabel(minutes ?? 0)} to ${name}`,
            verb: "Extended",
          },
          stop: { rpc: "StopSession" as const, summary: `Stop ${name}`, done: `Stopped ${name}`, verb: "Stopped" },
        }[action];
        return change<SessionJson>(rt, {
          ...spec,
          payload: action === "extend" ? { id: session.id, minutes } : { id: session.id },
          item: { kind: "session", id: session.id, ...(session.label ? { title: session.label } : {}) },
          keys: SESSIONS,
          hold: action === "stop",
          view: (value) => sessionView(value, rt.timeZone),
        });
      }),
    }),

    // ─── Tags ────────────────────────────────────────────────────────────
    list_tags: tool({
      description: "The user's tags (task categories), with ids for create_task and update_task.",
      inputSchema: z.object({}),
      execute: counted(rt, () =>
        read<TagJson[]>(rt, "ListTags", undefined, (tags) => ({
          tags: tags.map((tag) => ({ id: tag.id, name: tag.name, color: tag.color })),
        })),
      ),
    }),

    create_tag: tool({
      description:
        "Create a tag. Colors: gray, red, orange, amber, green, teal, blue, indigo, violet, pink. At most 50 tags.",
      inputSchema: z.object({ name: z.string().trim().min(1).max(30), color: z.string() }),
      execute: counted(rt, ({ name, color }) =>
        change<TagJson>(rt, {
          rpc: "CreateTag",
          payload: { name, color },
          summary: `Create tag: ${name}`,
          verb: "Created",
          item: { kind: "tag", title: name },
          done: `Created tag: ${name}`,
          keys: TAGS,
          view: (tag) => ({ id: tag.id, name: tag.name, color: tag.color }),
        }),
      ),
    }),

    // ─── What others share (visibility rules apply) ──────────────────────
    read_live: tool({
      description:
        "Recent activity on Live: `connections` (people the user is connected to), `mine`, or `all` (everyone public). Only what each person lets the user see.",
      inputSchema: z.object({
        scope: z.enum(["connections", "mine", "all"]),
        days: z.number().int().min(1).max(7).optional().describe("Default 1 (today)"),
      }),
      execute: counted(rt, ({ scope, days }) =>
        read<{ events: LiveEventJson[] }>(rt, "GetLive", { scope, days: days ?? 1 }, (value) => ({
          events: value.events.map((event) => ({
            who: event.mine ? "you" : `@${event.actor.username}`,
            what: event.kind,
            title: event.title ?? undefined,
            percent: event.meta.percent ?? undefined,
            minutes: event.meta.minutes ?? undefined,
            at: event.occurredAt,
          })),
        })),
      ),
    }),

    read_diary: tool({
      description:
        "Someone's diary (what they got done, by day), as much as they let the user see. `from` jumps to a day.",
      inputSchema: z.object({ username: z.string().min(1).max(31), from: day.optional() }),
      execute: counted(rt, ({ username, from }) =>
        read<DiaryPageJson>(rt, "GetDiary", { username, ...(from ? { from } : {}) }, (value) => ({
          days: value.days.map((diaryDay) => ({
            date: diaryDay.date,
            entries: diaryDay.entries.map((entry) => ({ what: entry.kind, title: entry.title ?? undefined })),
          })),
        })),
      ),
    }),
  };

  // ─── Long-term memory ───────────────────────────────────────────────────
  const memoryTools = {
    search_conversation: tool({
      description:
        "Search the whole conversation with the user, back to its first day, by keywords and by meaning. Use it when they ask about something said before that isn't in your context (\"what did I tell you about X in 2025?\"). `from` and `to` (inclusive) narrow it to dates. Answers short dated excerpts.",
      inputSchema: z.object({
        query: z.string().min(1).max(200).describe("What to look for, in plain words"),
        from: day.optional(),
        to: day.optional(),
      }),
      execute: counted(rt, (input) =>
        rt.memory.search(input).catch((error: unknown) => {
          console.error("search_conversation failed", error);
          return { error: "Search isn't working just now. Say so." };
        }),
      ),
    }),
    remember: tool({
      description:
        "Keep a lasting fact about the user when they ask you to remember something (\"remember that…\"). Write it as a short third-person sentence that makes sense alone. Pass `replaces` with the refs of memories it makes out of date.",
      inputSchema: z.object({
        text: z.string().min(3).max(300).describe('Like "Their sister Priya\'s birthday is March 3."'),
        kind: z.enum(TIBO_MEMORY_KINDS),
        replaces: z.array(z.string().max(8)).max(10).optional().describe("Refs (m1, m2…) of memories this replaces"),
      }),
      execute: counted(rt, ({ text, kind, replaces }) =>
        rt.memory.remember({ text, kind, replaces: replaces ?? [] }).catch((error: unknown) => {
          console.error("remember failed", error);
          return { error: "Couldn't save that just now. Nothing was kept. Say so." };
        }),
      ),
    }),
    forget: tool({
      description:
        "Forget lasting facts about the user when they ask (\"forget that I…\"). Pass the refs of the memories to delete. If you can't see them, pass `about` first: it lists matching memories with refs and deletes nothing. It doesn't erase the conversation itself.",
      inputSchema: z.object({
        refs: z.array(z.string().max(8)).max(10).optional().describe("Refs (m1, m2…) of the memories to forget"),
        about: z.string().max(200).optional().describe("What the memory is about, to look it up"),
      }),
      execute: counted(rt, ({ refs, about }) =>
        rt.memory.forget({ refs: refs ?? [], ...(about ? { about } : {}) }).catch((error: unknown) => {
          console.error("forget failed", error);
          return { error: "Couldn't do that just now. Nothing was forgotten. Say so." };
        }),
      ),
    }),
  };

  // ─── Answering a held action in words ──────────────────────────────────
  const reminderTools = {
    set_reminder: tool({
      description:
        "Message the user at a time they ask for (\"remind me tomorrow at 8 PM to watch the match\", \"ping me in an hour\"). Only when they ask to be reminded. Write `message` now, in your voice, as the bubble they'll get then: short, specific, no question you can't follow up on. It's sent as written, without your tools or their board, and doesn't count as a new request.",
      inputSchema: z.object({
        date: day,
        time: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .describe("24-hour HH:MM, the user's local time. Work out \"in an hour\" from the time right now."),
        about: z.string().min(1).max(80).describe("What it's about, a few words (\"Real Madrid vs Barça\")"),
        message: z.string().min(1).max(REMINDER_MESSAGE_MAX).describe("The reminder bubble, as they'll read it then"),
      }),
      execute: counted(rt, (input) => rt.reminders.set(input)),
    }),
    list_reminders: tool({
      description: "The reminders still to come, soonest first, with their ids.",
      inputSchema: z.object({}),
      execute: counted(rt, () => rt.reminders.list()),
    }),
    cancel_reminder: tool({
      description: "Cancel a reminder still to come, by its id from list_reminders. Only when the user asks.",
      inputSchema: z.object({ id }),
      execute: counted(rt, (input) => rt.reminders.cancel(input)),
    }),
  };

  const { confirmPending } = rt;
  return confirmPending
    ? {
        ...tools,
        ...memoryTools,
        ...reminderTools,
        confirm_action: tool({
          description:
            "Run (approve: true) or drop (approve: false) the actions waiting for the user's go-ahead, when the user's latest message clearly answers your question about them. Never on your own judgment.",
          inputSchema: z.object({ approve: z.boolean() }),
          execute: counted(rt, ({ approve }) => confirmPending(approve)),
        }),
      }
    : { ...tools, ...memoryTools, ...reminderTools };
}

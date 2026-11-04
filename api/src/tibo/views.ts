import { dayLabel, timeIn } from "./dates.ts";

export interface TaskJson {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly assignedDate: string | null;
  readonly deadlineDate: string | null;
  readonly tagId: string;
  readonly status: "idle" | "working" | "settled";
  readonly privacy: string;
  readonly importance: number | null;
  readonly expectedMinutes: number | null;
}
export interface DayTaskJson {
  readonly task: TaskJson;
  readonly role: "assigned" | "deadline" | "both";
}
export interface HabitJson {
  readonly id: string;
  readonly title: string;
  readonly status: "active" | "paused" | "archived";
  readonly privacy: string;
}
export interface HabitProgressJson {
  readonly done: number;
  readonly target: number;
  readonly complete: boolean;
  readonly periodStart: string;
  readonly periodEnd: string;
}
export interface HabitOnDayJson {
  readonly habit: HabitJson;
  readonly schedule: string;
  readonly date: string;
  readonly status: "not_due" | "due" | "complete";
  readonly progress: HabitProgressJson;
  readonly countOnDay: number;
  readonly streak: number;
}
export interface HabitSummaryJson {
  readonly habit: HabitJson;
  readonly schedule: string;
  readonly streak: number;
  readonly progress: HabitProgressJson;
}
export interface GoalJson {
  readonly id: string;
  readonly name: string;
  readonly progressMode: "slider" | "count";
  readonly progressPercent: number;
  readonly targetCount: number | null;
  readonly currentCount: number | null;
  readonly targetDate: string | null;
  readonly status: "active" | "paused" | "completed";
  readonly privacy: string;
}
export interface GoalLinkJson {
  readonly itemType: "habit" | "task";
  readonly itemId: string;
  readonly amount: number;
  readonly itemTitle: string;
}
export interface GoalSummaryJson {
  readonly goal: GoalJson;
  readonly links: readonly GoalLinkJson[];
}
export interface SessionJson {
  readonly id: string;
  readonly label: string | null;
  readonly plannedMinutes: number;
  readonly status: "running" | "paused" | "completed" | "stopped";
  readonly startedAt: string;
  readonly endsAt: string | null;
  readonly elapsedMs: number;
  readonly remainingMs: number;
}
export interface NoteJson {
  readonly id: string;
  readonly body: string;
  readonly localDate: string;
  readonly privacy: string;
}
export interface TagJson {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly systemKind: string | null;
}
export interface DayJson {
  readonly date: string;
  readonly tasks: { readonly open: readonly DayTaskJson[]; readonly settled: readonly DayTaskJson[] };
  readonly unscheduled: { readonly open: readonly TaskJson[]; readonly settled: readonly TaskJson[] };
  readonly habits: {
    readonly due: readonly HabitOnDayJson[];
    readonly settled: readonly HabitOnDayJson[];
    readonly allChecked: boolean;
  };
  readonly goals: { readonly active: readonly GoalJson[]; readonly completed: readonly GoalJson[] };
  readonly sessions: { readonly focusedMinutes: number; readonly sessions: readonly SessionJson[] };
  readonly notesCount: number;
}
export interface LiveEventJson {
  readonly actor: { readonly username: string; readonly name: string };
  readonly mine: boolean;
  readonly kind: string;
  readonly occurredAt: string;
  readonly title: string | null;
  readonly meta: { readonly percent: number | null; readonly minutes: number | null; readonly count: number | null };
}
export interface DiaryPageJson {
  readonly days: readonly {
    readonly date: string;
    readonly entries: readonly {
      readonly kind: string;
      readonly title: string | null;
      readonly meta: LiveEventJson["meta"];
    }[];
  }[];
  readonly nextCursor: string | null;
}

export const theirWords = (text: string) =>
  `<their_words>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</their_words>`;

export const IMPORTANCE = ["low", "minor", "medium", "high", "critical"] as const;
export type Importance = (typeof IMPORTANCE)[number];
export const importanceValue = (label: Importance) => IMPORTANCE.indexOf(label) + 1;
export const importanceLabel = (value: number | null) => (value ? IMPORTANCE[value - 1] : undefined);

export const TASK_STATUS_WORD = { idle: "todo", working: "in_progress", settled: "done" } as const;
export type TaskStatusWord = (typeof TASK_STATUS_WORD)[keyof typeof TASK_STATUS_WORD];
export const taskStatusOf = (word: TaskStatusWord) =>
  (Object.keys(TASK_STATUS_WORD) as (keyof typeof TASK_STATUS_WORD)[]).find((key) => TASK_STATUS_WORD[key] === word) ??
  "idle";

const compact = <T extends Record<string, unknown>>(value: T) =>
  Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined && field !== null)) as Partial<T>;

export const taskView = (task: TaskJson) =>
  compact({
    id: task.id,
    title: task.title,
    date: task.assignedDate,
    deadline: task.deadlineDate,
    status: TASK_STATUS_WORD[task.status],
    importance: importanceLabel(task.importance),
    minutes: task.expectedMinutes,
    notes: task.description || undefined,
    privacy: task.privacy,
  });

export const habitView = (habit: HabitOnDayJson | HabitSummaryJson) =>
  compact({
    id: habit.habit.id,
    title: habit.habit.title,
    schedule: habit.schedule,
    status: habit.habit.status === "active" ? ("status" in habit ? habit.status : undefined) : habit.habit.status,
    progress: `${habit.progress.done}/${habit.progress.target} (${habit.progress.periodStart} to ${habit.progress.periodEnd})`,
    checkInsToday: "countOnDay" in habit ? habit.countOnDay : undefined,
    streak: habit.streak || undefined,
  });

export const goalView = (goal: GoalJson) =>
  compact({
    id: goal.id,
    name: goal.name,
    mode: goal.progressMode === "slider" ? "percent" : "count",
    percent: Math.round(goal.progressPercent),
    count: goal.progressMode === "count" ? `${goal.currentCount ?? 0}/${goal.targetCount ?? 0}` : undefined,
    targetDate: goal.targetDate,
    status: goal.status,
  });

export const sessionView = (session: SessionJson, timeZone: string) =>
  compact({
    label: session.label,
    status: session.status,
    plannedMinutes: session.plannedMinutes,
    minutesLeft: session.status === "running" || session.status === "paused" ? Math.ceil(session.remainingMs / 60_000) : undefined,
    endsAt: session.status === "running" && session.endsAt ? timeIn(session.endsAt, timeZone) : undefined,
  });

export const noteView = (note: NoteJson) => ({ id: note.id, body: note.body, date: note.localDate });

export const taskReceipt = (title: string, date: string | null | undefined, deadline: string | null | undefined, today: string) =>
  [title, date ? dayLabel(date, today) : null, deadline && deadline !== date ? `Due ${dayLabel(deadline, today)}` : null]
    .filter(Boolean)
    .join(" · ");

export const minutesLabel = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours === 0 ? `${rest} min` : rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
};

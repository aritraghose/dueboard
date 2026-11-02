import type { Tag, Task } from "@dueboard/api/rpc";
import { type LocalDate, daysBetween, formatDay, relativeDay } from "@/lib/dates";

// Display helpers for tasks. The rules (which day a task shows on, what
// settling records) live in the API; these only word things.

/** Importance 1–5 in words. */
export const IMPORTANCE_LABEL = ["Low", "Minor", "Medium", "High", "Critical"] as const;

/** "45 min", "1 h", "1 h 30 min". */
export const formatMinutes = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
};

/** "Due today", "Due tomorrow", "Due yesterday", "Due Wed, Nov 4". */
export const deadlineLabel = (deadline: LocalDate, today: LocalDate): string => {
  const days = daysBetween(today, deadline);
  if (Math.abs(days) <= 1) return `Due ${relativeDay(deadline, today).toLowerCase()}`;
  return `Due ${formatDay(deadline, today)}`;
};

/** A deadline that passed while the task is still open. */
export const isOverdue = (task: Task, today: LocalDate): boolean =>
  task.status !== "settled" && task.deadlineDate !== null && task.deadlineDate < today;

/** "Today", "Tomorrow", "Yesterday", or "Wed, Nov 4", for group headings. */
export const dayHeading = (date: LocalDate, today: LocalDate): string =>
  Math.abs(daysBetween(today, date)) <= 1 ? relativeDay(date, today) : formatDay(date, today);

export type TaskGroup = { readonly date: LocalDate; readonly tasks: readonly Task[] };

/**
 * Groups tasks under a day, keeping each group's order, and sorts the
 * groups by day (`"asc"` or `"desc"`). Tasks `dayOf` can't place are left out.
 */
export const groupByDay = (
  tasks: readonly Task[],
  dayOf: (task: Task) => LocalDate | null,
  order: "asc" | "desc",
): TaskGroup[] => {
  const groups = new Map<LocalDate, Task[]>();
  for (const task of tasks) {
    const day = dayOf(task);
    if (!day) continue;
    const group = groups.get(day);
    if (group) group.push(task);
    else groups.set(day, [task]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (order === "asc" ? a.localeCompare(b) : b.localeCompare(a)))
    .map(([date, list]) => ({ date, tasks: list }));
};

/** The task's next day on or after `today`: its assigned date, else its deadline. */
export const upcomingDay = (task: Task, today: LocalDate): LocalDate | null => {
  const days = [task.assignedDate, task.deadlineDate].filter(
    (day): day is LocalDate => day !== null && day >= today,
  );
  return days.sort()[0] ?? null;
};

/**
 * Sorts by importance or expected minutes, keeping the list's own order for
 * ties. Tasks without the value go last whichever the direction.
 */
export const sortTasks = <T extends Task>(
  tasks: readonly T[],
  sort: "default" | "importance" | "minutes",
  direction: "asc" | "desc",
): readonly T[] => {
  if (sort === "default") return tasks;
  const valueOf = (task: Task) => (sort === "importance" ? task.importance : task.expectedMinutes);
  const sign = direction === "asc" ? 1 : -1;
  return tasks
    .map((task, index) => ({ task, index, value: valueOf(task) }))
    .sort((a, b) => {
      if (a.value === null || b.value === null) {
        if (a.value === b.value) return a.index - b.index;
        return a.value === null ? 1 : -1;
      }
      return (a.value - b.value) * sign || a.index - b.index;
    })
    .map(({ task }) => task);
};

export type TagGroup<T> = { readonly tag: Tag | undefined; readonly tasks: readonly T[] };

/** Groups tasks by tag, in the order of the user's tag list (an unknown tag last). */
export const groupByTag = <T extends Task>(tasks: readonly T[], tags: readonly Tag[]): TagGroup<T>[] => {
  const order = new Map(tags.map((tag, index) => [tag.id, index]));
  const groups = new Map<string, T[]>();
  for (const task of tasks) {
    const group = groups.get(task.tagId);
    if (group) group.push(task);
    else groups.set(task.tagId, [task]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity))
    .map(([tagId, list]) => ({ tag: tags.find((tag) => tag.id === tagId), tasks: list }));
};

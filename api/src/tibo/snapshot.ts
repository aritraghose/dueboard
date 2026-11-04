import type { ContextSection } from "./context.ts";
import { addDays, weekdayOf } from "./dates.ts";
import { importanceLabel, minutesLabel, sessionView, type DayJson, type SessionJson, type TaskJson } from "./views.ts";

const LIST_MAX = 10;

const capped = <A>(items: readonly A[], line: (item: A) => string, max = LIST_MAX) => [
  ...items.slice(0, max).map(line),
  ...(items.length > max ? [`- +${items.length - max} more`] : []),
];

const taskLine = (task: TaskJson, extra?: string) => {
  const stars = importanceLabel(task.importance);
  const bits = [
    task.status === "working" ? "in progress" : null,
    stars ? `${stars} importance` : null,
    task.expectedMinutes ? `~${minutesLabel(task.expectedMinutes)}` : null,
    extra ?? null,
  ].filter(Boolean);
  return `- ${task.title} [id ${task.id}]${bits.length > 0 ? ` (${bits.join(", ")})` : ""}`;
};

export function todaySnapshot(input: {
  readonly day: DayJson;
  readonly activeSession: SessionJson | null;
  readonly timeZone: string;
}): ContextSection {
  const { day, activeSession, timeZone } = input;
  const today = day.date;
  const lines = [
    `Today is ${weekdayOf(today)} ${today}; tomorrow is ${addDays(today, 1)}. Dates in tools are YYYY-MM-DD in ${timeZone}.`,
  ];

  const open = day.tasks.open;
  const settled = day.tasks.settled;
  lines.push("", `Tasks today: ${open.length} open, ${settled.length} done.`);
  lines.push(
    ...capped(open, ({ task, role }) =>
      taskLine(task, role === "deadline" ? "due today" : role === "both" ? "for today, due today" : undefined),
    ),
  );
  if (settled.length > 0) {
    const titles = settled.slice(0, 6).map(({ task }) => task.title);
    lines.push(`Done today: ${titles.join(", ")}${settled.length > 6 ? `, +${settled.length - 6} more` : ""}.`);
  }
  if (day.unscheduled.open.length > 0) {
    lines.push(`Unscheduled (no date): ${day.unscheduled.open.length} open.`);
    lines.push(...capped(day.unscheduled.open, (task) => taskLine(task), 5));
  }

  const due = day.habits.due;
  const doneHabits = day.habits.settled.filter((habit) => habit.status === "complete");
  lines.push("", `Habits: ${due.length} due today, ${doneHabits.length} done.`);
  lines.push(
    ...capped(
      due,
      (habit) =>
        `- ${habit.habit.title} [id ${habit.habit.id}] (${habit.schedule}; ${habit.progress.done}/${habit.progress.target} this period${habit.streak > 1 ? `, streak ${habit.streak}` : ""})`,
    ),
  );
  if (doneHabits.length > 0) lines.push(`Done: ${doneHabits.map((habit) => habit.habit.title).join(", ")}.`);

  const goals = day.goals.active;
  if (goals.length > 0) {
    lines.push("", `Active goals: ${goals.length}.`);
    lines.push(
      ...capped(goals, (goal) => {
        const count = goal.progressMode === "count" ? `, ${goal.currentCount ?? 0}/${goal.targetCount ?? 0}` : "";
        const by = goal.targetDate ? `, by ${goal.targetDate}` : "";
        return `- ${goal.name} [id ${goal.id}] (${Math.round(goal.progressPercent)}%${count}${by})`;
      }),
    );
  }

  lines.push("");
  if (activeSession) {
    const view = sessionView(activeSession, timeZone);
    lines.push(
      `Focus session: ${activeSession.label ? `"${activeSession.label}" ` : ""}${view.status}, ${view.minutesLeft} min left of ${view.plannedMinutes}${view.endsAt ? `, ends ${view.endsAt}` : ""}.`,
    );
  } else {
    lines.push("Focus session: none running.");
  }
  if (day.sessions.focusedMinutes > 0) lines.push(`Focused today: ${minutesLabel(day.sessions.focusedMinutes)}.`);
  if (day.notesCount > 0) lines.push(`Notes today: ${day.notesCount}.`);

  return { title: "The user's day (fresh at the start of this turn)", body: lines.join("\n") };
}

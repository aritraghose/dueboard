import * as Effect from "effect/Effect";
import { LocalDate, addDays, todayIn } from "./dates.ts";
import { listGoalsDueBetween, listGoalsForDay } from "./goals.ts";
import { listHabitsForDay, listUpcomingHabits } from "./habits.ts";
import { Day, GetUpcomingInput, InvalidInput, Upcoming, UpcomingDay, decodeInput } from "./model.ts";
import { countNotesForDay } from "./notes.ts";
import { listSessionsForDay } from "./sessions.ts";
import { getSettings } from "./settings.ts";
import { listOpenTasksBetween, listTasksForDay, listUnscheduledTasks } from "./tasks.ts";

export const getDay = Effect.fn("getDay")(function* (userId: string, date: LocalDate) {
  const day = yield* decodeInput(LocalDate)(date);
  const [tasks, unscheduled, habits, goals, sessions, notesCount] = yield* Effect.all(
    [
      listTasksForDay(userId, day),
      listUnscheduledTasks(userId, { settledOn: day }),
      listHabitsForDay(userId, day),
      listGoalsForDay(userId, day),
      listSessionsForDay(userId, day),
      countNotesForDay(userId, day),
    ],
    { concurrency: "unbounded" },
  );
  return new Day({ date: day, tasks, unscheduled, habits, goals, sessions, notesCount });
});

export const getUpcoming = Effect.fn("getUpcoming")(function* (userId: string, input: GetUpcomingInput) {
  const { from, days } = yield* decodeInput(GetUpcomingInput)(input);
  const settings = yield* getSettings(userId);
  if (from < todayIn(settings.timeZone)) {
    return yield* new InvalidInput({ message: "Upcoming starts today or later." });
  }
  const until = addDays(from, days);
  const last = addDays(until, -1);
  const [tasks, habits, goals] = yield* Effect.all(
    [
      listOpenTasksBetween(userId, from, last),
      listUpcomingHabits(userId, from, until),
      listGoalsDueBetween(userId, from, last),
    ],
    { concurrency: "unbounded" },
  );
  const result: Array<UpcomingDay> = [];
  for (let day = from; day < until; day = addDays(day, 1)) {
    const entry = new UpcomingDay({
      date: day,
      tasks: tasks.get(day) ?? [],
      habits: habits.get(day) ?? [],
      goals: goals.filter((goal) => goal.targetDate === day),
    });
    if (entry.tasks.length || entry.habits.length || entry.goals.length) result.push(entry);
  }
  return new Upcoming({ from, until, days: result });
});

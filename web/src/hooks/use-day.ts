import { useAtomMount } from "@effect/atom-react";
import * as Atom from "effect/reactivity/Atom";
import { addDays, type LocalDate } from "@/lib/dates";
import { ApiClient } from "../rpc-client.ts";

// `/now`'s day in one request (`GetDay`). It carries every per-day key, so
// any task, habit, goal, session or note write refetches the days on
// screen. Each section reads its part through a derived atom (below), with
// the same loading and failure states as the whole day.

const DAY_KEYS = ["tasks", "habits", "goals", "sessions", "notes"];

/** Everything `/now` shows on `date`. */
export const dayAtom = (date: LocalDate) => ApiClient.query("GetDay", { date }, { reactivityKeys: DAY_KEYS });

/** `/now`'s tasks for one day: open and settled, assigned or due that day. */
export const tasksForDayAtom = Atom.family((date: LocalDate) => Atom.mapResult(dayAtom(date), (day) => day.tasks));

/** Open tasks with no dates, plus those settled on `date`. */
export const dayUnscheduledAtom = Atom.family((date: LocalDate) =>
  Atom.mapResult(dayAtom(date), (day) => day.unscheduled),
);

export const habitsForDayAtom = Atom.family((date: LocalDate) => Atom.mapResult(dayAtom(date), (day) => day.habits));

export const goalsForDayAtom = Atom.family((date: LocalDate) => Atom.mapResult(dayAtom(date), (day) => day.goals));

export const sessionsForDayAtom = Atom.family((date: LocalDate) =>
  Atom.mapResult(dayAtom(date), (day) => day.sessions),
);

export const notesCountAtom = Atom.family((date: LocalDate) => Atom.mapResult(dayAtom(date), (day) => day.notesCount));

/**
 * Keeps the days before and after `date` loaded (and fresh), so ← and →
 * show them at once.
 */
export function usePrefetchNeighborDays(date: LocalDate) {
  useAtomMount(dayAtom(addDays(date, -1)));
  useAtomMount(dayAtom(addDays(date, 1)));
}

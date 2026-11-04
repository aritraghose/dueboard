import { useAtomMount } from "@effect/atom-react";
import * as Atom from "effect/reactivity/Atom";
import { addDays, type LocalDate } from "@/lib/dates";
import { ApiClient } from "../rpc-client.ts";

const DAY_KEYS = ["tasks", "habits", "goals", "sessions", "notes"];

export const dayAtom = (date: LocalDate) => ApiClient.query("GetDay", { date }, { reactivityKeys: DAY_KEYS });

export const tasksForDayAtom = Atom.family((date: LocalDate) => Atom.mapResult(dayAtom(date), (day) => day.tasks));

export const dayUnscheduledAtom = Atom.family((date: LocalDate) =>
  Atom.mapResult(dayAtom(date), (day) => day.unscheduled),
);

export const habitsForDayAtom = Atom.family((date: LocalDate) => Atom.mapResult(dayAtom(date), (day) => day.habits));

export const goalsForDayAtom = Atom.family((date: LocalDate) => Atom.mapResult(dayAtom(date), (day) => day.goals));

export const sessionsForDayAtom = Atom.family((date: LocalDate) =>
  Atom.mapResult(dayAtom(date), (day) => day.sessions),
);

export const notesCountAtom = Atom.family((date: LocalDate) => Atom.mapResult(dayAtom(date), (day) => day.notesCount));

export function usePrefetchNeighborDays(date: LocalDate) {
  useAtomMount(dayAtom(addDays(date, -1)));
  useAtomMount(dayAtom(addDays(date, 1)));
}

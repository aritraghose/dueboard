import type { CreateHabitInput, HabitOnDay, TagColor, UpdateHabitInput } from "@dueboard/api/rpc";
import { useAtomValue } from "@effect/atom-react";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Reactivity from "effect/reactivity/Reactivity";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { LocalDate } from "@/lib/dates";
import { ApiClient } from "../rpc-client.ts";
import { habitsForDayAtom } from "./use-day.ts";
import { failureMessage, useRun, useTags } from "./use-tasks.ts";

const HABITS = ["habits"];
const HABIT_WRITES = [...HABITS, "goals"];

export const habitListAtom = ApiClient.query("ListHabits", undefined, { reactivityKeys: HABITS });

export const habitAtom = (id: string) => ApiClient.query("GetHabit", { id }, { reactivityKeys: HABITS });

export function useHabitActions() {
  const run = useRun();
  return useMemo(() => {
    const call = <A, E>(effect: Effect.Effect<A, E, ApiClient | Reactivity.Reactivity>) => run(effect.pipe(Reactivity.mutation(HABIT_WRITES)));
    return {
      create: (payload: CreateHabitInput) => call(ApiClient.use((client) => client("CreateHabit", payload))),
      update: (payload: UpdateHabitInput) => call(ApiClient.use((client) => client("UpdateHabit", payload))),
      pause: (id: string) => call(ApiClient.use((client) => client("PauseHabit", { id }))),
      resume: (id: string) => call(ApiClient.use((client) => client("ResumeHabit", { id }))),
      archive: (id: string) => call(ApiClient.use((client) => client("ArchiveHabit", { id }))),
      remove: (id: string) => call(ApiClient.use((client) => client("DeleteHabit", { id }))),
      checkIn: (id: string, date: LocalDate) =>
        call(ApiClient.use((client) => client("CheckInHabit", { id, date }))),
      undo: (id: string, date: LocalDate) =>
        call(ApiClient.use((client) => client("UndoCheckInHabit", { id, date }))),
      reload: () => run(Reactivity.invalidate(HABITS)),
    };
  }, [run]);
}

export type ShownHabit = {
  readonly entry: HabitOnDay;
  readonly done: number;
  readonly countOnDay: number;
  readonly complete: boolean;
};

type Tracked = {
  readonly pending: number;
  readonly answer: HabitOnDay | null;
};

export function useHabitTaps(entries: readonly HabitOnDay[], date: LocalDate) {
  const actions = useHabitActions();
  const [tracked, setTracked] = useState<ReadonlyMap<string, Tracked>>(new Map());
  const queues = useRef(new Map<string, Promise<unknown>>());

  useEffect(() => {
    setTracked(new Map());
    queues.current = new Map();
  }, [date]);

  useEffect(() => {
    const stale = [...tracked].filter(([id, t]) => {
      if (t.pending !== 0 || !t.answer) return false;
      const listed = entries.find((entry) => entry.habit.id === id);
      return (
        listed !== undefined &&
        listed.countOnDay === t.answer.countOnDay &&
        listed.progress.done === t.answer.progress.done
      );
    });
    if (stale.length === 0) return;
    setTracked((current) => {
      const next = new Map(current);
      for (const [id] of stale) if (next.get(id)?.pending === 0) next.delete(id);
      return next;
    });
  }, [entries, tracked]);

  const shown = useCallback(
    (entry: HabitOnDay): ShownHabit => {
      const t = tracked.get(entry.habit.id);
      const base = t?.answer ?? entry;
      const pending = t?.pending ?? 0;
      const done = Math.max(0, base.progress.done + pending);
      return {
        entry: base,
        done,
        countOnDay: Math.max(0, base.countOnDay + pending),
        complete: done >= base.progress.target,
      };
    },
    [tracked],
  );

  const tap = useCallback(
    (entry: HabitOnDay, delta: 1 | -1) => {
      const id = entry.habit.id;
      const bump = (step: number, answer?: HabitOnDay) =>
        setTracked((current) => {
          const was = current.get(id) ?? { pending: 0, answer: null };
          return new Map(current).set(id, { pending: was.pending + step, answer: answer ?? was.answer });
        });
      bump(delta);
      const previous = queues.current.get(id) ?? Promise.resolve();
      const next = previous.then(async () => {
        const exit = await (delta === 1 ? actions.checkIn(id, date) : actions.undo(id, date));
        if (Exit.isSuccess(exit)) {
          bump(-delta, exit.value);
        } else {
          bump(-delta);
          toast.error(failureMessage(exit, delta === 1 ? "Couldn't check in." : "Couldn't undo the check-in."));
        }
      });
      queues.current.set(id, next);
      return next;
    },
    [actions, date],
  );

  return { shown, tap };
}

export function useHabitColor(): TagColor {
  return useTags()?.find((tag) => tag.systemKind === "habit")?.color ?? "green";
}

const COMPLETE_LINGER_MS = 650;

export function useDayHabits(date: LocalDate) {
  const result = useAtomValue(habitsForDayAtom(date));
  const day = AsyncResult.isSuccess(result) ? result.value : undefined;
  const entries = useMemo(() => (day ? [...day.due, ...day.settled] : []), [day]);
  const { shown, tap: send } = useHabitTaps(entries, date);
  const [lingering, setLingering] = useState<ReadonlySet<string>>(new Set());
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [celebrate, setCelebrate] = useState(false);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    setLingering(new Set());
    setTouched(new Set());
    setCelebrate(false);
  }, [date]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const all = entries.map(shown);
  const due = all.filter((habit) => !habit.complete || lingering.has(habit.entry.habit.id));
  const settled = all.filter((habit) => habit.complete && !lingering.has(habit.entry.habit.id));
  const allChecked = day !== undefined && due.length === 0 && settled.length > 0;

  const wasChecked = useRef(allChecked);
  useEffect(() => {
    if (allChecked && !wasChecked.current && touched.size > 0) setCelebrate(true);
    if (!allChecked) setCelebrate(false);
    wasChecked.current = allChecked;
  }, [allChecked, touched]);

  const tap = useCallback(
    (habit: ShownHabit, delta: 1 | -1) => {
      const id = habit.entry.habit.id;
      setTouched((current) => new Set(current).add(id));
      if (delta === 1 && !habit.complete && habit.done + 1 >= habit.entry.progress.target) {
        setLingering((current) => new Set(current).add(id));
        const timer = setTimeout(() => {
          timers.current.delete(timer);
          setLingering((current) => {
            const next = new Set(current);
            next.delete(id);
            return next;
          });
        }, COMPLETE_LINGER_MS);
        timers.current.add(timer);
      }
      return send(habit.entry, delta);
    },
    [send],
  );

  return {
    loaded: day !== undefined,
    failed: AsyncResult.isFailure(result),
    due,
    settled,
    allChecked,
    celebrate,
    touched,
    tap,
  };
}

export type DayHabits = ReturnType<typeof useDayHabits>;

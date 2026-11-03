import type {
  CreateGoalInput,
  Goal,
  GoalLinkItem,
  GoalStatus,
  LinkGoalItemInput,
  TagColor,
  UnlinkGoalItemInput,
  UpdateGoalInput,
} from "@dueboard/api/rpc";
import { goalValue } from "@dueboard/api/rpc";
import { useAtomValue } from "@effect/atom-react";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Atom from "effect/reactivity/Atom";
import * as Reactivity from "effect/reactivity/Reactivity";
import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { LocalDate } from "@/lib/dates";
import { type ItemGoalDraft, withShownValue } from "@/lib/goals";
import { ApiClient } from "../rpc-client.ts";
import { goalsForDayAtom } from "./use-day.ts";
import { failureMessage, useRun, useTags } from "./use-tasks.ts";

// Goals for the UI. Every goal query carries the `goals` reactivity key.
// Goal writes invalidate it, and so do habit and task writes (a tap or a
// settle can move a linked goal), so `/now` and `/goals` refetch after any
// change that could move a goal.

export const GOALS = ["goals"];

/** `/goals`: every goal, with its links and last 10 progress events. */
export const goalListAtom = ApiClient.query("ListGoals", {}, { reactivityKeys: GOALS });

/** A goal with its links and last 50 progress events. */
export const goalAtom = (id: string) => ApiClient.query("GetGoal", { id }, { reactivityKeys: GOALS });

/** Open tasks to link, by title (`ListTasks` keeps `tasks` as its key). */
export const linkableTasksAtom = (query: string) =>
  ApiClient.query(
    "ListTasks",
    { status: ["idle", "working"], limit: 20, ...(query ? { query } : {}) },
    { reactivityKeys: ["tasks"] },
  );

/** The goals a habit or task moves, for its card. */
export const itemGoalsAtom = (itemType: GoalLinkItem, itemId: string) =>
  ApiClient.query("ListItemGoals", { itemType, itemId }, { reactivityKeys: GOALS });

const noItemGoalsAtom = Atom.make(AsyncResult.initial());

/** Goal writes, each its own call (see `useRun`). Each returns its `Exit`. */
export function useGoalActions() {
  const run = useRun();
  return useMemo(() => {
    const call = <A, E>(effect: Effect.Effect<A, E, ApiClient | Reactivity.Reactivity>) =>
      run(effect.pipe(Reactivity.mutation(GOALS)));
    return {
      create: (payload: CreateGoalInput) => call(ApiClient.use((client) => client("CreateGoal", payload))),
      update: (payload: UpdateGoalInput) => call(ApiClient.use((client) => client("UpdateGoal", payload))),
      setProgress: (id: string, value: number) =>
        call(ApiClient.use((client) => client("SetGoalProgress", { id, value }))),
      adjust: (id: string, delta: number) =>
        call(ApiClient.use((client) => client("AdjustGoalProgress", { id, delta }))),
      pause: (id: string) => call(ApiClient.use((client) => client("PauseGoal", { id }))),
      resume: (id: string) => call(ApiClient.use((client) => client("ResumeGoal", { id }))),
      reopen: (id: string) => call(ApiClient.use((client) => client("ReopenGoal", { id }))),
      remove: (id: string) => call(ApiClient.use((client) => client("DeleteGoal", { id }))),
      link: (payload: LinkGoalItemInput) => call(ApiClient.use((client) => client("LinkGoalItem", payload))),
      unlink: (payload: UnlinkGoalItemInput) => call(ApiClient.use((client) => client("UnlinkGoalItem", payload))),
      /** Refetches every goal query on screen, failed ones included ("Try again"). */
      reload: () => run(Reactivity.invalidate(GOALS)),
    };
  }, [run]);
}

/** The `goal` tag's color, which every goal wears (violet until tags load). */
export function useGoalColor(): TagColor {
  return useTags()?.find((tag) => tag.systemKind === "goal")?.color ?? "violet";
}

type Tracked = {
  /** +1s sent and not answered yet (count goals). */
  readonly pending: number;
  /** A slider value not saved yet, with a token for the latest move. */
  readonly slider: { readonly value: number; readonly token: number } | null;
  /** The newest answer, newer than the list until the list catches up. */
  readonly answer: Goal | null;
};

const EMPTY: Tracked = { pending: 0, slider: null, answer: null };
/** How long a slider rests before its value is saved. */
const SLIDER_SAVE_MS = 450;
/** How long a just-completed goal celebrates. */
const CELEBRATION_MS = 1600;

/**
 * Progress changes shown right away. A count goal's "Move Goal" taps go to the API one
 * after another; a slider's moves save once it rests (debounced). `shown`
 * applies what's unanswered to the newest copy: the last answer until the
 * refetched list is as new, so a stale refetch never takes a change back.
 * A failed change drops out with a toast.
 */
export function useGoalProgress() {
  const actions = useGoalActions();
  const [tracked, setTracked] = useState<ReadonlyMap<string, Tracked>>(new Map());
  const queues = useRef(new Map<string, Promise<unknown>>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const nextToken = useRef(0);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const patch = useCallback(
    (id: string, change: (was: Tracked) => Tracked) =>
      setTracked((current) => new Map(current).set(id, change(current.get(id) ?? EMPTY))),
    [],
  );

  const shown = useCallback(
    (goal: Goal): Goal => {
      const t = tracked.get(goal.id);
      if (!t) return goal;
      const base = t.answer && t.answer.updatedAt > goal.updatedAt ? t.answer : goal;
      if (t.slider) return withShownValue(base, t.slider.value);
      if (t.pending) return withShownValue(base, goalValue(base) + t.pending);
      return base;
    },
    [tracked],
  );

  const increment = useCallback(
    (goal: Goal) => {
      const id = goal.id;
      patch(id, (was) => ({ ...was, pending: was.pending + 1 }));
      const previous = queues.current.get(id) ?? Promise.resolve();
      const next = previous.then(async () => {
        const exit = await actions.adjust(id, 1);
        patch(id, (was) => ({
          ...was,
          pending: was.pending - 1,
          answer: Exit.isSuccess(exit) ? exit.value : was.answer,
        }));
        if (Exit.isFailure(exit)) toast.error(failureMessage(exit, "Couldn't add to the goal."));
      });
      queues.current.set(id, next);
      return next;
    },
    [actions, patch],
  );

  const slide = useCallback(
    (goal: Goal, value: number) => {
      const id = goal.id;
      const token = ++nextToken.current;
      patch(id, (was) => ({ ...was, slider: { value, token } }));
      clearTimeout(timers.current.get(id));
      timers.current.set(
        id,
        setTimeout(async () => {
          timers.current.delete(id);
          const exit = await actions.setProgress(id, value);
          patch(id, (was) => ({
            ...was,
            // A newer move keeps its own value until its own save answers.
            slider: was.slider?.token === token ? null : was.slider,
            answer: Exit.isSuccess(exit) ? exit.value : was.answer,
          }));
          if (Exit.isFailure(exit)) toast.error(failureMessage(exit, "Couldn't save the progress."));
        }, SLIDER_SAVE_MS),
      );
    },
    [actions, patch],
  );

  return { shown, increment, slide };
}

/**
 * Goals that reached their target while on screen, for a moment, so their
 * celebration plays once and never on load. Empty with reduced motion.
 */
export function useJustCompleted(goals: readonly Goal[]): ReadonlySet<string> {
  const reduced = useReducedMotion();
  const seen = useRef<Map<string, GoalStatus> | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  // Compared by value: the list is a new array on every render.
  const statuses = goals.map((goal) => `${goal.id}:${goal.status}`).join(",");

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    const now = new Map(statuses ? statuses.split(",").map((entry) => entry.split(":") as [string, GoalStatus]) : []);
    const previous = seen.current;
    seen.current = now;
    if (!previous || reduced) return;
    const reached = [...now]
      .filter(([id, status]) => status === "completed" && previous.has(id) && previous.get(id) !== "completed")
      .map(([id]) => id);
    if (reached.length === 0) return;
    setFresh((current) => new Set([...current, ...reached]));
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setFresh((current) => {
        const next = new Set(current);
        for (const id of reached) next.delete(id);
        return next;
      });
    }, CELEBRATION_MS);
    timers.current.add(timer);
  }, [statuses, reduced]);

  return fresh;
}

/** `/now`'s goals for `date`: active and completed that day, with unsaved progress applied. */
export function useDayGoals(date: LocalDate) {
  const result = useAtomValue(goalsForDayAtom(date));
  const day = AsyncResult.isSuccess(result) ? result.value : undefined;
  const progress = useGoalProgress();
  const active = (day?.active ?? []).map(progress.shown);
  const completed = (day?.completed ?? []).map(progress.shown);
  const celebrating = useJustCompleted([...active, ...completed]);
  return {
    loaded: day !== undefined,
    failed: AsyncResult.isFailure(result),
    active,
    completed,
    celebrating,
    increment: progress.increment,
    slide: progress.slide,
  };
}

export type DayGoals = ReturnType<typeof useDayGoals>;

/**
 * Saves a habit's or task's goals: from `before` (what's saved) to `after`
 * (the card's drafts). Unlinks what's gone, creates the new count goals,
 * and links (or changes the amount of) the rest. Resolves to the first
 * failure's message, or `null` when everything saved.
 */
export function useItemGoalSync() {
  const actions = useGoalActions();
  return useCallback(
    async (
      itemType: GoalLinkItem,
      itemId: string,
      before: readonly ItemGoalDraft[],
      after: readonly ItemGoalDraft[],
    ): Promise<string | null> => {
      const kept = new Set(after.map((draft) => draft.goalId));
      for (const draft of before) {
        if (!draft.goalId || kept.has(draft.goalId)) continue;
        const exit = await actions.unlink({ goalId: draft.goalId, itemType, itemId });
        if (Exit.isFailure(exit)) return failureMessage(exit, `Couldn't unlink "${draft.name}".`);
      }
      for (const draft of after) {
        let goalId = draft.goalId;
        if (!goalId) {
          const created = await actions.create({
            name: draft.name,
            progressMode: "count",
            targetCount: draft.targetCount ?? 1,
          });
          if (Exit.isFailure(created)) return failureMessage(created, `Couldn't create "${draft.name}".`);
          goalId = created.value.id;
        } else if (before.some((saved) => saved.goalId === goalId && saved.amount === draft.amount)) {
          continue;
        }
        const exit = await actions.link({ goalId, itemType, itemId, amount: draft.amount });
        if (Exit.isFailure(exit)) return failureMessage(exit, `Couldn't link "${draft.name}".`);
      }
      return null;
    },
    [actions],
  );
}

/** Compares drafts by what the API stores: which goal (by name for new ones) and the amount. */
const draftsSignature = (drafts: readonly ItemGoalDraft[]): string =>
  drafts
    .map((draft) => `${draft.name}:${draft.amount}`)
    .sort()
    .join("|");

/**
 * A habit's or task's goals for its card: `saved` (what the API has, `[]`
 * for a new item) and the card's `drafts`, both `undefined` while loading.
 * `edit` replaces the drafts. `settle(true)` says they were saved: they
 * stay on screen until the refetched list agrees, so it never flickers
 * back; `settle(false)` drops them (a failed save).
 */
export function useItemGoalDrafts(itemType: GoalLinkItem, itemId: string | null) {
  // A new item has nothing to ask the API about.
  const result = useAtomValue(
    itemId ? itemGoalsAtom(itemType, itemId) : (noItemGoalsAtom as unknown as ReturnType<typeof itemGoalsAtom>),
  );
  const saved = useMemo<readonly ItemGoalDraft[] | undefined>(() => {
    if (!itemId) return [];
    if (!AsyncResult.isSuccess(result)) return undefined;
    return result.value.map(({ goal, link }) => ({
      key: goal.id,
      goalId: goal.id,
      name: goal.name,
      targetCount: goal.targetCount,
      amount: link.amount,
    }));
  }, [itemId, result]);
  const [local, setLocal] = useState<{ drafts: readonly ItemGoalDraft[]; settled: boolean } | null>(null);

  useEffect(() => {
    if (local?.settled && saved && draftsSignature(saved) === draftsSignature(local.drafts)) setLocal(null);
  }, [local, saved]);

  const edit = useCallback((drafts: readonly ItemGoalDraft[]) => setLocal({ drafts, settled: false }), []);
  const settle = useCallback(
    (ok: boolean) => setLocal((current) => (ok && current ? { ...current, settled: true } : null)),
    [],
  );
  return { saved, drafts: local?.drafts ?? saved, edit, settle };
}

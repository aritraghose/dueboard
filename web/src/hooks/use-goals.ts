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

export const GOALS = ["goals"];

export const goalListAtom = ApiClient.query("ListGoals", {}, { reactivityKeys: GOALS });

export const goalAtom = (id: string) => ApiClient.query("GetGoal", { id }, { reactivityKeys: GOALS });

export const linkableTasksAtom = (query: string) =>
  ApiClient.query(
    "ListTasks",
    { status: ["idle", "working"], limit: 20, ...(query ? { query } : {}) },
    { reactivityKeys: ["tasks"] },
  );

export const itemGoalsAtom = (itemType: GoalLinkItem, itemId: string) =>
  ApiClient.query("ListItemGoals", { itemType, itemId }, { reactivityKeys: GOALS });

const noItemGoalsAtom = Atom.make(AsyncResult.initial());

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
      reload: () => run(Reactivity.invalidate(GOALS)),
    };
  }, [run]);
}

export function useGoalColor(): TagColor {
  return useTags()?.find((tag) => tag.systemKind === "goal")?.color ?? "violet";
}

type Tracked = {
  readonly pending: number;
  readonly slider: { readonly value: number; readonly token: number } | null;
  readonly answer: Goal | null;
};

const EMPTY: Tracked = { pending: 0, slider: null, answer: null };
const SLIDER_SAVE_MS = 450;
const CELEBRATION_MS = 1600;

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

export function useJustCompleted(goals: readonly Goal[]): ReadonlySet<string> {
  const reduced = useReducedMotion();
  const seen = useRef<Map<string, GoalStatus> | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
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

const draftsSignature = (drafts: readonly ItemGoalDraft[]): string =>
  drafts
    .map((draft) => `${draft.name}:${draft.amount}`)
    .sort()
    .join("|");

export function useItemGoalDrafts(itemType: GoalLinkItem, itemId: string | null) {
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

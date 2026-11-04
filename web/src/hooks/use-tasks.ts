import type {
  CreateTagInput,
  CreateTaskInput,
  ListTasksInput,
  SetTaskStatusInput,
  Tag,
  Task,
  TaskStatus,
  UpdateTagInput,
  UpdateTaskInput,
} from "@dueboard/api/rpc";
import { RegistryContext, useAtomValue } from "@effect/atom-react";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Atom from "effect/reactivity/Atom";
import * as AtomRegistry from "effect/reactivity/AtomRegistry";
import * as Reactivity from "effect/reactivity/Reactivity";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiClient } from "../rpc-client.ts";
import { useBootstrap } from "./use-bootstrap.ts";

const TASKS = ["tasks"];
const TAGS = ["tags"];
const TASK_WRITES = [...TASKS, "goals"];

export const unscheduledAtom = ApiClient.query("ListUnscheduledTasks", {}, { reactivityKeys: TASKS });

export const taskAtom = (id: string) => ApiClient.query("GetTask", { id }, { reactivityKeys: TASKS });

const tagsAtom = ApiClient.query("ListTags", undefined, { reactivityKeys: TAGS });

const removedTasksAtom = Atom.make({ ids: new Set<string>() as ReadonlySet<string> }).pipe(Atom.keepAlive);

export function useWithoutRemoved<T extends { readonly id: string }>(tasks: readonly T[]): readonly T[] {
  const { ids } = useAtomValue(removedTasksAtom);
  return useMemo(() => (ids.size ? tasks.filter((task) => !ids.has(task.id)) : tasks), [tasks, ids]);
}

export const taskListAtom = Atom.family(
  ({ filters, pages }: { filters: Omit<ListTasksInput, "cursor">; pages: number }) =>
    Atom.make((get) =>
      Effect.gen(function* () {
        const tasks: Task[] = [];
        let cursor: string | undefined;
        for (let page = 0; page < pages; page++) {
          const result = yield* get.result(
            ApiClient.query("ListTasks", cursor ? { ...filters, cursor } : filters, {
              reactivityKeys: TASKS,
            }),
          );
          tasks.push(...result.tasks);
          if (!result.nextCursor) return { tasks, nextCursor: null };
          cursor = result.nextCursor;
        }
        return { tasks, nextCursor: cursor ?? null };
      }),
    ),
);

export function useTags(): readonly Tag[] | undefined {
  const bootstrap = useBootstrap();
  const result = useAtomValue(tagsAtom);
  return AsyncResult.isSuccess(result) ? result.value : bootstrap?.tags;
}

export function useTagMap(): ReadonlyMap<string, Tag> {
  const tags = useTags();
  return useMemo(() => new Map((tags ?? []).map((tag) => [tag.id, tag])), [tags]);
}

export function failureMessage(exit: Exit.Exit<unknown, unknown>, fallback: string): string {
  if (Exit.isSuccess(exit)) return "";
  const error = Cause.squash(exit.cause);
  if (error && typeof error === "object" && "_tag" in error && "message" in error) {
    const tag = (error as { _tag: string })._tag;
    if (tag === "RpcClientError") return `${fallback} Check your connection and try again.`;
    if (tag === "TooManyRequests") return "Too many changes at once. Wait a moment and try again.";
    return String((error as { message: unknown }).message);
  }
  return fallback;
}

export function useRun() {
  const registry = useContext(RegistryContext);
  return useCallback(
    <A, E>(effect: Effect.Effect<A, E, ApiClient | Reactivity.Reactivity>) => {
      const atom = ApiClient.runtime.fn((_: void) => effect);
      const release = registry.mount(atom);
      registry.set(atom, undefined);
      return Effect.runPromiseExit(
        AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true }),
      ).finally(release);
    },
    [registry],
  );
}

export function useTaskActions() {
  const registry = useContext(RegistryContext);
  const run = useRun();

  return useMemo(
    () => ({
      create: (payload: CreateTaskInput) =>
        run(ApiClient.use((client) => client("CreateTask", payload)).pipe(Reactivity.mutation(TASK_WRITES))),
      update: (payload: UpdateTaskInput) =>
        run(ApiClient.use((client) => client("UpdateTask", payload)).pipe(Reactivity.mutation(TASK_WRITES))),
      setStatus: (payload: SetTaskStatusInput) =>
        run(
          ApiClient.use((client) => client("SetTaskStatus", payload)).pipe(Reactivity.mutation(TASK_WRITES)),
        ),
      remove: async (id: string) => {
        registry.update(removedTasksAtom, ({ ids }) => ({ ids: new Set(ids).add(id) }));
        const exit = await run(
          ApiClient.use((client) => client("DeleteTask", { id })).pipe(Reactivity.mutation(TASK_WRITES)),
        );
        if (Exit.isFailure(exit)) {
          registry.update(removedTasksAtom, ({ ids }) => {
            const next = new Set(ids);
            next.delete(id);
            return { ids: next };
          });
        }
        return exit;
      },
      reload: () => run(Reactivity.invalidate([...TASKS, ...TAGS])),
      createTag: (payload: CreateTagInput) =>
        run(ApiClient.use((client) => client("CreateTag", payload)).pipe(Reactivity.mutation(TAGS))),
      updateTag: (payload: UpdateTagInput) =>
        run(ApiClient.use((client) => client("UpdateTag", payload)).pipe(Reactivity.mutation(TAGS))),
      deleteTag: (id: string) =>
        run(
          ApiClient.use((client) => client("DeleteTag", { id })).pipe(Reactivity.mutation([...TAGS, ...TASKS])),
        ),
    }),
    [run, registry],
  );
}

export function useOptimisticStatus(tasks: readonly Task[]) {
  const { setStatus } = useTaskActions();
  const [clicks, setClicks] = useState<
    ReadonlyMap<string, { status: TaskStatus; token: number; answered: boolean }>
  >(new Map());
  const nextToken = useRef(0);

  useEffect(() => {
    const serverStatus = new Map(tasks.map((task) => [task.id, task.status]));
    const agreed = [...clicks].filter(
      ([id, click]) => click.answered && serverStatus.get(id) === click.status,
    );
    if (agreed.length === 0) return;
    setClicks((current) => {
      const next = new Map(current);
      for (const [id, click] of agreed) if (next.get(id)?.token === click.token) next.delete(id);
      return next;
    });
  }, [tasks, clicks]);

  const change = useCallback(
    async (task: Task, status: TaskStatus) => {
      const token = ++nextToken.current;
      setClicks((current) => new Map(current).set(task.id, { status, token, answered: false }));
      const exit = await setStatus({ id: task.id, status });
      setClicks((current) => {
        if (current.get(task.id)?.token !== token) return current;
        const next = new Map(current);
        if (Exit.isSuccess(exit)) next.set(task.id, { status, token, answered: true });
        else next.delete(task.id);
        return next;
      });
      if (Exit.isFailure(exit)) {
        toast.error(
          failureMessage(exit, status === "settled" ? "Couldn't settle the task." : "Couldn't reopen the task."),
        );
      }
      return exit;
    },
    [setStatus],
  );

  const overridden = useMemo(
    () => new Map([...clicks].map(([id, click]) => [id, click.status] as const)),
    [clicks],
  );
  const statusOf = useCallback((task: Task): TaskStatus => overridden.get(task.id) ?? task.status, [overridden]);

  return { statusOf, change, overridden };
}

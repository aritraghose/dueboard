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
import type { LocalDate } from "@/lib/dates";
import { ApiClient } from "../rpc-client.ts";
import { useBootstrap } from "./use-bootstrap.ts";

// Tasks and tags for the UI. Every task query carries the `tasks` reactivity
// key and every task mutation invalidates it, so whatever list is on screen
// refetches after a change. Tags use the `tags` key the same way.

const TASKS = ["tasks"];
const TAGS = ["tags"];

/** `/now`'s tasks for one day: open and settled, assigned or due that day. */
export const tasksForDayAtom = (date: LocalDate) =>
  ApiClient.query("ListTasksForDay", { date }, { reactivityKeys: TASKS });

/** Open tasks with no dates, plus those settled on `settledOn`. */
export const unscheduledAtom = (settledOn?: LocalDate) =>
  ApiClient.query("ListUnscheduledTasks", settledOn ? { settledOn } : {}, { reactivityKeys: TASKS });

export const taskAtom = (id: string) => ApiClient.query("GetTask", { id }, { reactivityKeys: TASKS });

const tagsAtom = ApiClient.query("ListTags", undefined, { reactivityKeys: TAGS });

/** Tasks deleted in this session: lists leave them out while their delete (and the refetch) is under way. */
// Wrapped in an object: given a Set itself, `Atom.make` would read it as a stream of values.
const removedTasksAtom = Atom.make({ ids: new Set<string>() as ReadonlySet<string> }).pipe(Atom.keepAlive);

/** Drops tasks being deleted, or just deleted, from a list. */
export function useWithoutRemoved<T extends { readonly id: string }>(tasks: readonly T[]): readonly T[] {
  const { ids } = useAtomValue(removedTasksAtom);
  return useMemo(() => (ids.size ? tasks.filter((task) => !ids.has(task.id)) : tasks), [tasks, ids]);
}

/**
 * `/tasks`' list: the first `pages` pages of `ListTasks` for `filters`,
 * joined. Each page is its own query atom (with the `tasks` key), so "Load
 * more" only fetches the new page and a change refetches what's shown.
 */
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

/**
 * The user's tags. Bootstrap's copy stands in until `ListTags` answers, and
 * `ListTags` refetches after a tag is created.
 */
export function useTags(): readonly Tag[] | undefined {
  const bootstrap = useBootstrap();
  const result = useAtomValue(tagsAtom);
  return AsyncResult.isSuccess(result) ? result.value : bootstrap?.tags;
}

/** A tag by id, from {@link useTags}. */
export function useTagMap(): ReadonlyMap<string, Tag> {
  const tags = useTags();
  return useMemo(() => new Map((tags ?? []).map((tag) => [tag.id, tag])), [tags]);
}

/**
 * The message to show for a failed call: the API's own message for typed
 * errors ("The assigned date can't be after the deadline"), a generic one
 * for network trouble.
 */
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

/**
 * Runs one RPC call as its own short-lived atom on the app's registry, so
 * overlapping calls never cancel or answer for each other, as one shared
 * mutation atom would. Resolves to the call's `Exit`.
 */
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

/**
 * Task and tag writes. Each call is its own short-lived atom on the app's
 * registry, so overlapping calls (settling two tasks quickly) never cancel
 * or answer for each other, as one shared mutation atom would. Each returns
 * its `Exit`; the caller decides how to show a failure.
 */
export function useTaskActions() {
  const registry = useContext(RegistryContext);
  const run = useRun();

  return useMemo(
    () => ({
      create: (payload: CreateTaskInput) =>
        run(ApiClient.use((client) => client("CreateTask", payload)).pipe(Reactivity.mutation(TASKS))),
      update: (payload: UpdateTaskInput) =>
        run(ApiClient.use((client) => client("UpdateTask", payload)).pipe(Reactivity.mutation(TASKS))),
      setStatus: (payload: SetTaskStatusInput) =>
        run(
          ApiClient.use((client) => client("SetTaskStatus", payload)).pipe(Reactivity.mutation(TASKS)),
        ),
      // The row hides at once and comes back only if the delete fails.
      remove: async (id: string) => {
        registry.update(removedTasksAtom, ({ ids }) => ({ ids: new Set(ids).add(id) }));
        const exit = await run(
          ApiClient.use((client) => client("DeleteTask", { id })).pipe(Reactivity.mutation(TASKS)),
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
      /** Refetches every task and tag query on screen, failed ones included ("Try again"). */
      reload: () => run(Reactivity.invalidate([...TASKS, ...TAGS])),
      createTag: (payload: CreateTagInput) =>
        run(ApiClient.use((client) => client("CreateTag", payload)).pipe(Reactivity.mutation(TAGS))),
      updateTag: (payload: UpdateTagInput) =>
        run(ApiClient.use((client) => client("UpdateTag", payload)).pipe(Reactivity.mutation(TAGS))),
      // Deleting a tag moves its tasks to `default`, so task lists refetch too.
      deleteTag: (id: string) =>
        run(
          ApiClient.use((client) => client("DeleteTag", { id })).pipe(Reactivity.mutation([...TAGS, ...TASKS])),
        ),
    }),
    [run, registry],
  );
}

/**
 * Settling and reopening, shown right away. `statusOf` gives a task's status
 * with the user's latest click applied; the click's override is dropped once
 * the refetched list agrees (so the row never jumps back while the list
 * reloads), or when the call fails, with a toast.
 */
export function useOptimisticStatus(tasks: readonly Task[]) {
  const { setStatus } = useTaskActions();
  // Per task: the clicked status, a token for the latest click, and whether
  // its call has answered. Only an answered click can be dropped, so a list
  // refetched before the call landed can't flip the row back.
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

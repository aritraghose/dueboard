import { TODO_TEXT_MAX_LENGTH, TooManyRequests } from "@dueboard/api/rpc";
import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import * as Cause from "effect/Cause";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { authClient } from "../auth-client.ts";
import { createTodoAtom, deleteTodoAtom, listTodosAtom, toggleTodoAtom } from "../rpc-client.ts";
import { getSessionUser } from "../session.ts";

export const Route = createFileRoute("/")({
  // Only signed-in users who finished onboarding reach the app. The API
  // enforces the same rule on every todo RPC.
  beforeLoad: async () => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/sign-in" });
    if (!user.username) throw redirect({ to: "/onboarding" });
    return { user: { ...user, username: user.username } };
  },
  component: Home,
});

type Filter = "all" | "active" | "done";

/**
 * A mutation that has been sent but isn't reflected in the list yet. Each RPC
 * is a round trip to Neon, so rows show their pending state until the
 * refetched list confirms the change.
 */
type Pending = { readonly kind: "toggle"; readonly done: boolean } | { readonly kind: "delete" };

/** A todo being created, shown as a placeholder row until the list includes it. */
interface Draft {
  readonly key: number;
  readonly text: string;
  /** Ids already in the list when the draft was sent, to spot the new row. */
  readonly knownIds: ReadonlySet<number>;
}

const FILTERS: ReadonlyArray<{ readonly id: Filter; readonly label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "done", label: "Done" },
];

/**
 * The message to show for a failed todo mutation. A rate-limited request says
 * so; anything else gets the action's generic message.
 */
function failureMessage(cause: Cause.Cause<unknown>, fallback: string): string {
  const error = Option.getOrUndefined(Cause.findErrorOption(cause));
  return error instanceof TooManyRequests ? error.message : fallback;
}

function Home() {
  const { user } = Route.useRouteContext();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    await authClient.signOut();
    // A full page load also drops every cached query atom of this user.
    window.location.assign("/sign-in");
  };

  return (
    <main className="page">
      <div className="account">
        {user.image ? (
          <img className="avatar" src={user.image} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="avatar" aria-hidden="true">
            {user.username.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="account-name">@{user.username}</span>
        <button type="button" className="button-ghost" onClick={signOut} disabled={signingOut}>
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>

      <header className="hero">
        <p className="eyebrow">Alchemy on Cloudflare</p>
        <h1 className="title">Todos</h1>
        <p className="subtitle">
          A small example of full-stack app built with Tanstack Start + Effect RPC + Neon Postgres + Drizzle +
          Monorepo + Hyperdrive
        </p>
      </header>

      <TodoApp />

      <p className="footer">
        Browser &rarr; <code>/rpc</code> &rarr; ApiWorker &rarr; Drizzle &rarr; Neon
      </p>
    </main>
  );
}

function TodoApp() {
  const result = useAtomValue(listTodosAtom);
  const refresh = useAtomRefresh(listTodosAtom);
  const createTodo = useAtomSet(createTodoAtom, { mode: "promiseExit" });
  const toggleTodo = useAtomSet(toggleTodoAtom, { mode: "promiseExit" });
  const deleteTodo = useAtomSet(deleteTodoAtom, { mode: "promiseExit" });

  const [filter, setFilter] = useState<Filter>("all");
  const [pending, setPending] = useState<ReadonlyMap<number, Pending>>(new Map());
  const [drafts, setDrafts] = useState<ReadonlyArray<Draft>>([]);
  const [error, setError] = useState<string | null>(null);
  const draftKey = useRef(0);

  const todos = AsyncResult.getOrElse(result, () => []);

  // Drop pending markers and drafts once the refetched list reflects them.
  useEffect(() => {
    const byId = new Map(todos.map((todo) => [todo.id, todo]));
    setPending((current) => {
      const next = new Map(current);
      for (const [id, change] of current) {
        const todo = byId.get(id);
        const settled = change.kind === "delete" ? !todo : todo?.done === change.done;
        if (settled) next.delete(id);
      }
      return next.size === current.size ? current : next;
    });
    setDrafts((current) => {
      const next = current.filter(
        (draft) => !todos.some((todo) => !draft.knownIds.has(todo.id) && todo.text === draft.text),
      );
      return next.length === current.length ? current : next;
    });
  }, [todos]);

  const markPending = (id: number, change: Pending | undefined) =>
    setPending((current) => {
      const next = new Map(current);
      if (change) next.set(id, change);
      else next.delete(id);
      return next;
    });

  const onCreate = (text: string) => {
    const draft: Draft = {
      key: draftKey.current++,
      text,
      knownIds: new Set(todos.map((todo) => todo.id)),
    };
    setDrafts((current) => [...current, draft]);
    void createTodo({ payload: { text }, reactivityKeys: ["todos"] }).then((exit) => {
      if (Exit.isFailure(exit)) {
        setDrafts((current) => current.filter((d) => d.key !== draft.key));
        setError(failureMessage(exit.cause, "Couldn't add that todo. Please try again."));
      }
    });
  };

  const onToggle = (id: number, done: boolean) => {
    markPending(id, { kind: "toggle", done });
    void toggleTodo({ payload: { id, done }, reactivityKeys: ["todos"] }).then((exit) => {
      if (Exit.isFailure(exit)) {
        markPending(id, undefined);
        setError(failureMessage(exit.cause, "Couldn't update that todo. Please try again."));
      }
    });
  };

  const onDelete = (id: number) => {
    markPending(id, { kind: "delete" });
    void deleteTodo({ payload: { id }, reactivityKeys: ["todos"] }).then((exit) => {
      if (Exit.isFailure(exit)) {
        markPending(id, undefined);
        setError(failureMessage(exit.cause, "Couldn't delete that todo. Please try again."));
      }
    });
  };

  // What the user sees: the server list with pending toggles applied.
  const view = useMemo(
    () =>
      todos.map((todo) => {
        const change = pending.get(todo.id);
        return {
          id: todo.id,
          text: todo.text,
          createdAt: todo.createdAt,
          done: change?.kind === "toggle" ? change.done : todo.done,
          pending: change?.kind,
        };
      }),
    [todos, pending],
  );

  const doneCount = view.filter((todo) => todo.done).length;
  const counts: Record<Filter, number> = {
    all: view.length,
    active: view.length - doneCount,
    done: doneCount,
  };
  const visible = view.filter((todo) =>
    filter === "all" ? true : filter === "done" ? todo.done : !todo.done,
  );
  const percent = view.length ? Math.round((doneCount / view.length) * 100) : 0;

  // The list is fetched in the browser only; on the server, render the skeleton.
  const isServer = typeof window === "undefined";
  const isLoading = isServer || (AsyncResult.isWaiting(result) && !AsyncResult.isSuccess(result));
  const isSyncing = !isLoading && (AsyncResult.isWaiting(result) || pending.size > 0 || drafts.length > 0);
  const loadFailed = !isServer && AsyncResult.isFailure(result) && !todos.length;

  return (
    <section className="card" aria-label="Todo list">
      <div className="card-header">
        <div className="summary">
          <span>
            <strong>{counts.active}</strong> {counts.active === 1 ? "task" : "tasks"} left
          </span>
          <span>
            {doneCount} of {view.length} done
          </span>
        </div>
        <div
          className="progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label="Completed"
        >
          <div className="progress-bar" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <TodoComposer onCreate={onCreate} disabled={isLoading || loadFailed} />

      <div className="toolbar">
        <div className="filters" role="group" aria-label="Filter todos">
          {FILTERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className="filter"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
              <span className="filter-count">{counts[id]}</span>
            </button>
          ))}
        </div>
        <span className="sync" aria-live="polite">
          {isSyncing ? (
            <>
              <span className="spinner" aria-hidden="true" /> Saving…
            </>
          ) : isLoading ? (
            "Loading…"
          ) : (
            "All changes saved"
          )}
        </span>
      </div>

      {error && (
        <div className="alert" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {isLoading ? (
        <LoadingRows />
      ) : loadFailed ? (
        <EmptyState
          mark="!"
          title="Couldn't load your todos"
          hint={
            <button type="button" className="button-primary" onClick={refresh}>
              Try again
            </button>
          }
        />
      ) : visible.length === 0 && drafts.length === 0 ? (
        <EmptyState
          mark={filter === "done" ? "○" : "✓"}
          title={
            view.length === 0
              ? "Nothing to do yet"
              : filter === "done"
                ? "Nothing finished yet"
                : "All caught up"
          }
          hint={view.length === 0 ? "Add your first todo above." : "Switch filters to see the rest."}
        />
      ) : (
        <ul className="list">
          {visible.map((todo) => (
            <li
              key={todo.id}
              className="item"
              data-done={todo.done}
              data-pending={todo.pending === "delete" ? "delete" : todo.pending ? "true" : undefined}
            >
              <input
                type="checkbox"
                className="check"
                checked={todo.done}
                disabled={todo.pending !== undefined}
                onChange={() => onToggle(todo.id, !todo.done)}
                aria-label={`Mark "${todo.text}" as ${todo.done ? "not done" : "done"}`}
              />
              <span className="item-text">{todo.text}</span>
              {todo.pending ? (
                <span className="spinner item-meta" aria-label="Saving" />
              ) : (
                <time className="item-meta" dateTime={todo.createdAt.toISOString()}>
                  {formatAge(todo.createdAt)}
                </time>
              )}
              <button
                type="button"
                className="icon-button"
                disabled={todo.pending !== undefined}
                onClick={() => onDelete(todo.id)}
                aria-label={`Delete "${todo.text}"`}
                title="Delete"
              >
                ×
              </button>
            </li>
          ))}
          {filter !== "done" &&
            drafts.map((draft) => (
              <li key={`draft-${draft.key}`} className="item" data-pending="true">
                <input type="checkbox" className="check" disabled aria-hidden="true" />
                <span className="item-text">{draft.text}</span>
                <span className="spinner item-meta" aria-label="Adding" />
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}

function TodoComposer({
  onCreate,
  disabled,
}: {
  readonly onCreate: (text: string) => void;
  readonly disabled: boolean;
}) {
  const [text, setText] = useState("");
  const trimmed = text.trim();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmed) return;
    onCreate(trimmed);
    setText("");
  };

  return (
    <form className="composer" onSubmit={submit}>
      <input
        className="composer-input"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="What needs doing?"
        aria-label="New todo"
        maxLength={TODO_TEXT_MAX_LENGTH}
        disabled={disabled}
      />
      <button type="submit" className="button-primary" disabled={disabled || !trimmed}>
        Add
      </button>
    </form>
  );
}

function LoadingRows() {
  return (
    <div aria-busy="true" aria-label="Loading todos">
      {[68, 52, 76].map((width) => (
        <div key={width} className="skeleton">
          <div className="skeleton-box" />
          <div className="skeleton-line" style={{ width: `${width}%` }} />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  mark,
  title,
  hint,
}: {
  readonly mark: string;
  readonly title: string;
  readonly hint: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-mark" aria-hidden="true">
        {mark}
      </div>
      <p className="empty-title">{title}</p>
      <div className="empty-hint">{hint}</div>
    </div>
  );
}

const relativeTime = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/** "just now", "5 min ago", "yesterday", or a short date for older todos. */
function formatAge(date: Date): string {
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  if (abs < 3600) return relativeTime.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return relativeTime.format(Math.round(seconds / 3600), "hour");
  if (abs < 7 * 86400) return relativeTime.format(Math.round(seconds / 86400), "day");
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

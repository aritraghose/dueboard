import * as Context from "effect/Context";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";
import * as RpcMiddleware from "effect/rpc/RpcMiddleware";
import * as Schema from "effect/Schema";
import { LocalDate } from "./domain/dates.ts";
import {
  CreateTagInput,
  CreateTaskInput,
  Id,
  InvalidInput,
  ListTasksInput,
  ListUnscheduledTasksInput,
  SetTaskStatusInput,
  Settings,
  SettingsPatch,
  SystemTagLocked,
  TIME_ZONE_MAX_LENGTH,
  Tag,
  TagLimitReached,
  TagNameTaken,
  TagNotFound,
  Task,
  TaskNotFound,
  TaskPage,
  TasksForDay,
  UnscheduledTasks,
  UpdateTagInput,
  UpdateTaskInput,
} from "./domain/model.ts";

// The domain's values, inputs and errors, for the browser.
export * from "./domain/model.ts";
export { LocalDate, addDays, localDateOf, startOfWeek, todayIn } from "./domain/dates.ts";

/**
 * Shared domain + RPC contract.
 *
 * This module is the single source of truth imported by BOTH ends:
 *   - the `ApiWorker` RpcWorker ({@link ./api.ts}) serves it, and
 *   - the browser `AtomRpc` client (`web/src/rpc-client.ts`) consumes it via
 *     the `@dueboard/api/rpc` export.
 *
 * One `Schema` codec round-trips every value over the wire, so the React UI is
 * fully typed against the same shapes the Postgres-backed handlers return.
 */

/** The signed-in, onboarded user an RPC runs as. Provided by {@link Authentication}. */
export class CurrentUser extends Context.Service<
  CurrentUser,
  { readonly id: string; readonly username: string }
>()("api/CurrentUser") {}

/** Raised when the request has no session, or its user hasn't picked a username yet. */
export class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {
  message: Schema.String,
}) {}

/** Raised when a user sends more RPCs than their per-minute budget allows. */
export class TooManyRequests extends Schema.TaggedError<TooManyRequests>()("TooManyRequests", {
  message: Schema.String,
}) {}

/**
 * Resolves the Better Auth session from the request's cookies, applies the
 * user's rate limit, and provides {@link CurrentUser} to every RPC.
 * Implemented in `./api.ts`.
 */
export class Authentication extends RpcMiddleware.Service<
  Authentication,
  { provides: CurrentUser }
>()("api/Authentication", { error: Schema.Union([Unauthorized, TooManyRequests]) }) {}

/** What the app loads on start: the user's settings and tags. */
export class BootstrapResult extends Schema.Class<BootstrapResult>("BootstrapResult")({
  settings: Settings,
  tags: Schema.Array(Tag),
}) {}

/**
 * Every RPC the API serves. Add each new procedure here with `Rpc.make(...)`
 * and implement it in `./api.ts`, as a thin call into a domain service
 * (`./domain/`). The middleware runs every RPC as the signed-in, onboarded
 * user.
 */
export class ApiRpcs extends RpcGroup.make(
  /**
   * Run by the `_app` layout on every app load with the browser's IANA zone.
   * Creates the settings row and system tags if missing (this also
   * backfills older accounts) and saves the zone when it changed.
   */
  Rpc.make("Bootstrap", {
    payload: { timeZone: Schema.String.check(Schema.isMaxLength(TIME_ZONE_MAX_LENGTH)) },
    success: BootstrapResult,
  }),
  Rpc.make("UpdateSettings", {
    payload: SettingsPatch,
    success: Settings,
    error: InvalidInput,
  }),
  Rpc.make("ListTags", {
    success: Schema.Array(Tag),
  }),
  Rpc.make("CreateTag", {
    payload: CreateTagInput,
    success: Tag,
    error: Schema.Union([InvalidInput, TagNameTaken, TagLimitReached]),
  }),
  Rpc.make("UpdateTag", {
    payload: UpdateTagInput,
    success: Tag,
    error: Schema.Union([InvalidInput, TagNotFound, TagNameTaken, SystemTagLocked]),
  }),
  /** Deletes one of the user's own tags and returns its id. Its items move to `default`. */
  Rpc.make("DeleteTag", {
    payload: { id: Id },
    success: Schema.String,
    error: Schema.Union([TagNotFound, SystemTagLocked]),
  }),
  /**
   * `tagId` defaults to the `default` tag, `privacy` and `shareToLive` to the
   * user's settings. `TagNotFound` when the tag isn't theirs; `InvalidInput`
   * when the assigned date is after the deadline.
   */
  Rpc.make("CreateTask", {
    payload: CreateTaskInput,
    success: Task,
    error: Schema.Union([InvalidInput, TagNotFound]),
  }),
  /** A partial update: a missing key is unchanged, `null` clears. */
  Rpc.make("UpdateTask", {
    payload: UpdateTaskInput,
    success: Task,
    error: Schema.Union([InvalidInput, TaskNotFound, TagNotFound]),
  }),
  /** Settling records a `task_settled` activity; leaving `settled` removes it. */
  Rpc.make("SetTaskStatus", {
    payload: SetTaskStatusInput,
    success: Task,
    error: Schema.Union([InvalidInput, TaskNotFound]),
  }),
  /** Deletes a task and its activity, and returns its id. */
  Rpc.make("DeleteTask", {
    payload: { id: Id },
    success: Schema.String,
    error: Schema.Union([InvalidInput, TaskNotFound]),
  }),
  Rpc.make("GetTask", {
    payload: { id: Id },
    success: Task,
    error: Schema.Union([InvalidInput, TaskNotFound]),
  }),
  /** `/now`'s tasks for a day: those assigned or due that day, open and settled. */
  Rpc.make("ListTasksForDay", {
    payload: { date: LocalDate },
    success: TasksForDay,
    error: InvalidInput,
  }),
  Rpc.make("ListUnscheduledTasks", {
    payload: ListUnscheduledTasksInput,
    success: UnscheduledTasks,
    error: InvalidInput,
  }),
  /** `/tasks`: filtered, newest first, paginated by `nextCursor`. */
  Rpc.make("ListTasks", {
    payload: ListTasksInput,
    success: TaskPage,
    error: InvalidInput,
  }),
).middleware(Authentication) {}

import * as Context from "effect/Context";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";
import * as RpcMiddleware from "effect/rpc/RpcMiddleware";
import * as Schema from "effect/Schema";

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

/** A single todo item, encoded over the wire and decoded back into this class. */
export class Todo extends Schema.Class<Todo>("Todo")({
  id: Schema.Number,
  text: Schema.String,
  done: Schema.Boolean,
  createdAt: Schema.Date,
}) {}

/** Raised when a mutation targets a todo id that no longer exists. */
export class TodoNotFound extends Schema.TaggedError<TodoNotFound>()("TodoNotFound", {
  message: Schema.String,
  id: Schema.Number,
}) {}

/** The signed-in, onboarded user an RPC runs as. Provided by {@link Authentication}. */
export class CurrentUser extends Context.Service<
  CurrentUser,
  { readonly id: string; readonly username: string }
>()("api/CurrentUser") {}

/** Raised when the request has no session, or its user hasn't picked a username yet. */
export class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {
  message: Schema.String,
}) {}

/** Raised when a user sends more todo RPCs than their per-minute budget allows. */
export class TooManyRequests extends Schema.TaggedError<TooManyRequests>()("TooManyRequests", {
  message: Schema.String,
}) {}

/**
 * Resolves the Better Auth session from the request's cookies, applies the
 * user's rate limit, and provides {@link CurrentUser} to every todo RPC.
 * Implemented in `./api.ts`.
 */
export class Authentication extends RpcMiddleware.Service<
  Authentication,
  { provides: CurrentUser }
>()("api/Authentication", { error: Schema.Union([Unauthorized, TooManyRequests]) }) {}

/** The longest todo text the API stores. Matches the composer's `maxLength`. */
export const TODO_TEXT_MAX_LENGTH = 200;

export class TodoRpcs extends RpcGroup.make(
  Rpc.make("listTodos", {
    success: Schema.Array(Todo),
  }),
  Rpc.make("createTodo", {
    payload: {
      // Trimmed and non-empty, so a blank todo is rejected even when the API
      // is called directly. The composer trims before sending.
      text: Schema.String.check(
        Schema.isTrimmed(),
        Schema.isMinLength(1),
        Schema.isMaxLength(TODO_TEXT_MAX_LENGTH),
      ),
    },
    success: Todo,
  }),
  Rpc.make("toggleTodo", {
    payload: { id: Schema.Number, done: Schema.Boolean },
    success: Todo,
    error: TodoNotFound,
  }),
  Rpc.make("deleteTodo", {
    payload: { id: Schema.Number },
    success: Schema.Number,
    error: TodoNotFound,
  }),
).middleware(Authentication) {}

import * as Context from "effect/Context";
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

/**
 * Every RPC the API serves. Empty for now: add each new procedure here with
 * `Rpc.make(...)` and implement it in `./api.ts`. The middleware runs every
 * RPC as the signed-in, onboarded user.
 */
export class ApiRpcs extends RpcGroup.make().middleware(Authentication) {}

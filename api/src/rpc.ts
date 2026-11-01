import * as Context from "effect/Context";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";
import * as RpcMiddleware from "effect/rpc/RpcMiddleware";
import * as Schema from "effect/Schema";
import {
  CreateTagInput,
  Id,
  InvalidInput,
  Settings,
  SettingsPatch,
  SystemTagLocked,
  TIME_ZONE_MAX_LENGTH,
  Tag,
  TagLimitReached,
  TagNameTaken,
  TagNotFound,
  UpdateTagInput,
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
).middleware(Authentication) {}

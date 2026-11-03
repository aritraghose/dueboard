import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { SqlError } from "effect/sql";
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core";
import type {
  EffectPgDatabase,
  EffectPgQueryEffectHKT,
  EffectPgQueryResultHKT,
} from "drizzle-orm/effect-postgres";
import type { PgEffectDatabase } from "drizzle-orm/pg-core/effect";
import type { relations } from "../schema.ts";

type Relations = typeof relations;

/**
 * The Drizzle database every domain service queries. Provided per Worker by
 * `../api.ts` (over Hyperdrive), and by the DomainWorker (`../DomainWorker.ts`) that Tibo.s
 * tools call. Services take the acting user id as an argument and scope
 * every query to it; they never read it from here.
 */
export class Database extends Context.Service<Database, EffectPgDatabase<Relations>>()(
  "api/Database",
) {}

/**
 * The database or an open transaction. Helpers that must join the caller's
 * transaction (such as `recordActivity`) take one of these.
 */
export type Executor = PgEffectDatabase<EffectPgQueryEffectHKT, EffectPgQueryResultHKT, Relations>;

/** A new row id. See architecture.md §4. */
export const newId = (): string => crypto.randomUUID();

type DbError = EffectDrizzleQueryError | SqlError.SqlError;

const isDbError = (error: unknown): error is DbError =>
  typeof error === "object" &&
  error !== null &&
  ((error as { _tag?: unknown })._tag === "EffectDrizzleQueryError" || SqlError.isSqlError(error));

/**
 * Turns database failures into defects and keeps the domain's typed errors,
 * so a service's error channel lists only what its callers can act on.
 * Wrap a whole transaction (or query) in it.
 */
export const orDieOnDbError = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, Exclude<E, DbError>, R> =>
  Effect.catchIf(effect, isDbError, (error) => Effect.die(error)) as Effect.Effect<
    A,
    Exclude<E, DbError>,
    R
  >;

/**
 * Runs `body` in a transaction on `db`, with database failures as defects.
 * Prefer it to `db.transaction`: Drizzle's declared error type for a
 * transaction resolves to `any` under this Effect version, which would hide
 * the body's typed errors.
 */
export const transaction = <A, E, R>(
  db: Executor,
  body: (tx: Executor) => Effect.Effect<A, E, R>,
): Effect.Effect<A, Exclude<E, DbError>, R> =>
  orDieOnDbError(db.transaction(body) as Effect.Effect<A, E | DbError, R>);

/**
 * Whether a database error was a unique-constraint violation. Drizzle wraps
 * the `SqlError` in an Effect `Cause` (`cause.reasons[].error`), and the
 * `SqlError`'s reason is tagged `UniqueViolation`; the driver's SQLSTATE
 * `23505` is checked too in case the wrapping changes.
 */
export const isUniqueViolation = (error: unknown, depth = 0): boolean => {
  if (typeof error !== "object" || error === null || depth > 8) return false;
  const value = error as {
    _tag?: unknown;
    code?: unknown;
    reason?: unknown;
    cause?: unknown;
    reasons?: unknown;
    error?: unknown;
  };
  if (value._tag === "UniqueViolation" || value.code === "23505") return true;
  const reasons = Array.isArray(value.reasons) ? value.reasons : [];
  const next = [value.reason, value.cause, value.error, ...reasons];
  return next.some((cause) => isUniqueViolation(cause, depth + 1));
};

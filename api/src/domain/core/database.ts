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

export class Database extends Context.Service<Database, EffectPgDatabase<Relations>>()(
  "api/Database",
) {}

export type Executor = PgEffectDatabase<EffectPgQueryEffectHKT, EffectPgQueryResultHKT, Relations>;

export const newId = (): string => crypto.randomUUID();

type DbError = EffectDrizzleQueryError | SqlError.SqlError;

const isDbError = (error: unknown): error is DbError =>
  typeof error === "object" &&
  error !== null &&
  ((error as { _tag?: unknown })._tag === "EffectDrizzleQueryError" || SqlError.isSqlError(error));

export const orDieOnDbError = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, Exclude<E, DbError>, R> =>
  Effect.catchIf(effect, isDbError, (error) => Effect.die(error)) as Effect.Effect<
    A,
    Exclude<E, DbError>,
    R
  >;

export const transaction = <A, E, R>(
  db: Executor,
  body: (tx: Executor) => Effect.Effect<A, E, R>,
): Effect.Effect<A, Exclude<E, DbError>, R> =>
  orDieOnDbError(db.transaction(body) as Effect.Effect<A, E | DbError, R>);

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

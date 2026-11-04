import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Drizzle from "@alchemy.run/drizzle/Postgres";
import { RuntimeContext } from "alchemy";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Headers from "effect/http/Headers";
import { Rpc, RpcMessage } from "effect/rpc";
import { Hyperdrive } from "./database.ts";
import { AuthAccounts } from "./domain/account.ts";
import { Database } from "./domain/database.ts";
import { DEV_PORTS } from "./dev-ports.ts";
import { AI_UNITS_PER_CHARGE_MAX, AiUsageReason, Id, type AiUsage } from "./domain/model.ts";
import { RateLimiter } from "./domain/rate-limiter.ts";
import * as TiboService from "./domain/tibo.ts";
import * as UsageService from "./domain/usage.ts";
import { AiQuota } from "./domain/usage.ts";
import {
  TIBO_RPCS,
  type AiUsageJson,
  type DomainError,
  type DomainResult,
  type TiboRpc,
} from "./domain-client.ts";
import { apiHandlers } from "./handlers.ts";
import { AI_MONTHLY_MESSAGE_QUOTA_DEFAULT, ApiRpcs, CurrentUser, Viewer } from "./rpc.ts";
import { relations } from "./schema.ts";

/** Most queued Tibo wipes handed out per call. */
const TIBO_WIPE_BATCH = 50;
/** Most queued Tibo events handed out per call (the cron runs every minute). */
const TIBO_EVENT_BATCH = 200;

const Units = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: AI_UNITS_PER_CHARGE_MAX }));
const Ref = Schema.NullOr(Schema.String.check(Schema.isMaxLength(128)));
const UserIds = Schema.Array(Id).check(Schema.isMaxLength(TIBO_WIPE_BATCH));
const EventIds = Schema.Array(Id).check(Schema.isMaxLength(TIBO_EVENT_BATCH));

const usageJson = (usage: AiUsage): AiUsageJson => ({
  used: usage.used,
  limit: usage.limit,
  remaining: usage.remaining,
  period: usage.period,
  resetsAt: usage.resetsAt.toISOString(),
});

/**
 * The domain services for Tibo (architecture.md §3): a private Worker with
 * no HTTP routes and no URL, only Worker RPC methods, bound into the
 * AgentWorker alone (`env.DOMAIN`). Nothing in the web stack binds it, so a
 * browser has no path to it.
 *
 * `run` executes one of the same `ApiRpcs` handlers the UI calls
 * (`./handlers.ts`), as `actorUserId`, with the same Schema decoding of its
 * payload. Only the RPCs in `TIBO_RPCS` are allowed. The `TiboAgent` passes
 * its own name (its user's id) as the actor, and its tools never take a user
 * id from the model, so Tibo can only ever act as its own user.
 *
 * Every answer is plain JSON (encoded with the RPC's own schemas), since
 * Worker RPC can't carry class instances, and the AgentWorker stays free of
 * Effect.
 *
 * Why not an entrypoint on the ApiWorker: Alchemy's Effect Workers only
 * export the default entrypoint (plus Durable Object and Workflow classes),
 * and the default one is what the website binds.
 */
export default class DomainWorker extends Cloudflare.Worker<DomainWorker>()(
  "DomainWorker",
  {
    main: import.meta.filename,
    workersDev: false,
    dev: { port: DEV_PORTS.DomainWorker },
  },
  Effect.gen(function* () {
    const conn = yield* Cloudflare.Hyperdrive.Connect(Hyperdrive);
    const db = yield* Drizzle.Postgres(conn.connectionString, { relations });

    const monthlyMessages = yield* Config.Int("AI_MONTHLY_MESSAGE_QUOTA").pipe(
      Config.withDefault(AI_MONTHLY_MESSAGE_QUOTA_DEFAULT),
    );
    const services = Layer.mergeAll(
      Layer.succeed(Database, db),
      Layer.succeed(AiQuota, { monthlyMessages }),
      // Not in `TIBO_RPCS`: connection requests, people search and account
      // deletion. Refuse them here too.
      Layer.succeed(RateLimiter, { allow: () => Effect.succeed(false) }),
      Layer.succeed(AuthAccounts, {
        deleteUser: () => Effect.die(new Error("Tibo can't delete accounts")),
      }),
    );

    /** Runs a domain effect, turning defects into a logged, rejected call. */
    const exec = <A, E>(effect: Effect.Effect<A, E, Database | AiQuota>) =>
      effect.pipe(
        Effect.provide(services),
        Effect.catchDefect((defect) =>
          Effect.logError("Domain call failed", defect).pipe(
            Effect.andThen(Effect.die(new Error("Internal server error"))),
          ),
        ),
        Effect.provide(RuntimeContext.phantom),
      );

    let nextRequestId = 0;

    return {
      /** One of `TIBO_RPCS`, as `actorUserId`. Typed failures come back as `ok: false`. */
      run: (actorUserId: string, name: TiboRpc, payload: unknown) =>
        Effect.gen(function* () {
          if (!TIBO_RPCS.includes(name) || !ApiRpcs.requests.has(name)) {
            return {
              ok: false,
              error: { tag: "NotAllowed", message: `${name} isn't available to Tibo.` },
            } satisfies DomainResult;
          }
          const rpc = ApiRpcs.requests.get(name) as Rpc.AnyWithProps;
          const decoded = yield* Schema.decodeUnknownEffect(rpc.payloadSchema as Schema.Codec<unknown, unknown>)(payload).pipe(
            Effect.mapError((error) => ({ tag: "InvalidInput", message: error.message })),
          );
          // Built per call, inside this request: a context captured at init
          // would carry another request's I/O, which Workers refuse (the
          // call hangs).
          const handlers = yield* ApiRpcs.toHandlers(apiHandlers).pipe(Effect.provide(services));
          const handler = yield* (ApiRpcs.accessHandler(name).pipe(
            Effect.provide(handlers),
          ) as unknown as Effect.Effect<AnyHandler>);
          const outcome = yield* handler(decoded, {
            client: new Rpc.ServerClient(0),
            requestId: RpcMessage.RequestId(++nextRequestId),
            headers: Headers.empty,
          }).pipe(
            // Only `id` is read by the allowed RPCs.
            Effect.provideService(CurrentUser, { id: actorUserId, username: "" }),
            Effect.provideService(Viewer, { user: { id: actorUserId, username: "" } }),
            Effect.map((value) => ({ ok: true as const, value })),
            Effect.catch((error) => Effect.succeed({ ok: false as const, error })),
          );
          if (outcome.ok) {
            const value = yield* Schema.encodeUnknownEffect(rpc.successSchema as Schema.Codec<unknown, unknown>)(outcome.value).pipe(
              Effect.orDie,
            );
            return { ok: true, value } satisfies DomainResult;
          }
          const error = yield* Schema.encodeUnknownEffect(rpc.errorSchema as Schema.Codec<unknown, unknown>)(outcome.error).pipe(
            Effect.orDie,
          );
          return { ok: false, error: errorOf(error) } satisfies DomainResult;
        }).pipe(
          Effect.catch((error) => Effect.succeed({ ok: false, error } satisfies DomainResult)),
          exec,
        ),

      // ─── The AI usage ledger (`./domain/usage.ts`) ─────────────────────────
      usageGet: (userId: string) =>
        exec(
          Schema.decodeUnknownEffect(Id)(userId).pipe(
            Effect.flatMap(UsageService.getUsage),
            Effect.map(usageJson),
            Effect.orDie,
          ),
        ),
      usageCheck: (userId: string, units: number) =>
        exec(
          Effect.all({ userId: Schema.decodeUnknownEffect(Id)(userId), units: Schema.decodeUnknownEffect(Units)(units) }).pipe(
            Effect.flatMap(({ userId, units }) =>
              Effect.all({
                allowed: UsageService.canSpend(userId, units),
                usage: UsageService.getUsage(userId).pipe(Effect.map(usageJson)),
              }),
            ),
            Effect.orDie,
          ),
        ),
      usageRecord: (userId: string, units: number, reason: AiUsageReason, ref: string | null) =>
        exec(
          Effect.all({
            userId: Schema.decodeUnknownEffect(Id)(userId),
            units: Schema.decodeUnknownEffect(Units)(units),
            reason: Schema.decodeUnknownEffect(AiUsageReason)(reason),
            ref: Schema.decodeUnknownEffect(Ref)(ref),
          }).pipe(
            Effect.flatMap(({ userId, units, reason, ref }) => UsageService.recordUsage(userId, units, reason, ref)),
            Effect.map(usageJson),
            Effect.orDie,
          ),
        ),
      usageChargeSplit: (
        userA: string,
        userB: string,
        unitsEach: number,
        reason: AiUsageReason,
        ref: string | null,
      ) =>
        exec(
          Effect.all({
            userA: Schema.decodeUnknownEffect(Id)(userA),
            userB: Schema.decodeUnknownEffect(Id)(userB),
            unitsEach: Schema.decodeUnknownEffect(Units)(unitsEach),
            reason: Schema.decodeUnknownEffect(AiUsageReason)(reason),
            ref: Schema.decodeUnknownEffect(Ref)(ref),
          }).pipe(
            Effect.flatMap(({ userA, userB, unitsEach, reason, ref }) =>
              UsageService.chargeSplit(userA, userB, unitsEach, reason, ref),
            ),
            Effect.as({ ok: true as const }),
            Effect.orDie,
          ),
        ),

      // ─── Tibo's own facts, the event outbox and the wipe queue (`./domain/tibo.ts`)
      tiboProfile: (userId: string) =>
        exec(Schema.decodeUnknownEffect(Id)(userId).pipe(Effect.flatMap(TiboService.getTiboProfile), Effect.orDie)),
      tiboProactive: (userId: string) =>
        exec(Schema.decodeUnknownEffect(Id)(userId).pipe(Effect.flatMap(TiboService.getTiboProactive), Effect.orDie)),
      pendingTiboEvents: () =>
        exec(TiboService.pendingTiboEvents(TIBO_EVENT_BATCH).pipe(Effect.map((events) => ({ events })))),
      tiboEventsDone: (ids: readonly string[]) =>
        exec(
          Schema.decodeUnknownEffect(EventIds)(ids).pipe(
            Effect.flatMap(TiboService.clearTiboEvents),
            Effect.as({ ok: true as const }),
            Effect.orDie,
          ),
        ),
      pendingWipes: () =>
        exec(TiboService.pendingTiboWipes(TIBO_WIPE_BATCH).pipe(Effect.map((userIds) => ({ userIds })))),
      wipesDone: (userIds: readonly string[]) =>
        exec(
          Schema.decodeUnknownEffect(UserIds)(userIds).pipe(
            Effect.flatMap(TiboService.clearTiboWipes),
            Effect.as({ ok: true as const }),
            Effect.orDie,
          ),
        ),
    };
  }).pipe(Effect.provide(Cloudflare.Hyperdrive.ConnectBinding)),
) {}

/** An `ApiRpcs` handler with its payload and services erased (they're checked at runtime). */
type AnyHandler = (
  payload: unknown,
  options: { client: Rpc.ServerClient; requestId: RpcMessage.RequestId; headers: Headers.Headers },
) => Effect.Effect<unknown, unknown, CurrentUser | Viewer>;

/** A typed error as `{ tag, message }` plus its other fields (an `ActiveSessionExists`'s session). */
function errorOf(encoded: unknown): DomainError {
  const { _tag, message, ...details } = (encoded ?? {}) as Record<string, unknown>;
  return {
    tag: typeof _tag === "string" ? _tag : "Error",
    message: typeof message === "string" ? message : "Something went wrong.",
    ...(Object.keys(details).length > 0 ? { details } : {}),
  };
}

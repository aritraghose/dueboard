import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Drizzle from "@alchemy.run/drizzle/Postgres";
import { RuntimeContext } from "alchemy";
import * as Config from "effect/Config";
import type { HttpEffect } from "alchemy/Http";
import * as Effect from "effect/Effect";
import { HttpServerRequest } from "effect/http/HttpServerRequest";
import * as Layer from "effect/Layer";
import type * as Scope from "effect/Scope";
import { RpcSerialization, RpcServer } from "effect/rpc";
import { Auth } from "./auth.ts";
import { Hyperdrive } from "./database.ts";
import { DEV_PORTS } from "./dev-ports.ts";
import { AuthAccounts } from "./domain/account.ts";
import { Database } from "./domain/database.ts";
import * as AskService from "./domain/ask.ts";
import * as SessionsService from "./domain/sessions.ts";
import { RateLimiter } from "./domain/rate-limiter.ts";
import { AiQuota } from "./domain/usage.ts";
import { apiHandlers } from "./handlers.ts";
import { LIMITS, bindingProps } from "./limits.ts";
import {
  AI_MONTHLY_MESSAGE_QUOTA_DEFAULT,
  ApiRpcs,
  Authentication,
  CurrentUser,
  OptionalAuthentication,
  TooManyRequests,
  Unauthorized,
  Viewer,
} from "./rpc.ts";
import { relations } from "./schema.ts";

const ASK_PRUNE_MINUTE = 17;

export default class ApiWorker extends Cloudflare.Workers.RpcWorker<ApiWorker>()(
  "ApiWorker",
  {
    main: import.meta.filename,
    workersDev: false,
    dev: { port: DEV_PORTS.ApiWorker },
    schema: ApiRpcs,
  },
  Effect.gen(function* () {
    const conn = yield* Cloudflare.Hyperdrive.Connect(Hyperdrive);
    const db = yield* Drizzle.Postgres(conn.connectionString, { relations });

    const rateLimit = (spec: (typeof LIMITS)[keyof typeof LIMITS]) =>
      Cloudflare.RateLimit(spec.name, bindingProps(spec));
    const rpcLimit = yield* rateLimit(LIMITS.rpc);
    const connectionRequestLimit = yield* rateLimit(LIMITS.connectionRequest);
    const peopleSearchLimit = yield* rateLimit(LIMITS.peopleSearch);
    const publicReadLimit = yield* rateLimit(LIMITS.publicRead);

    const monthlyMessages = yield* Config.Int("AI_MONTHLY_MESSAGE_QUOTA").pipe(
      Config.withDefault(AI_MONTHLY_MESSAGE_QUOTA_DEFAULT),
    );
    const aiQuota = Layer.succeed(AiQuota, { monthlyMessages });

    yield* Cloudflare.Workers.cron("* * * * *", () =>
      SessionsService.sweepExpiredSessions().pipe(
        Effect.tap((completed) =>
          completed > 0 ? Effect.log(`Session sweep completed ${completed}`) : Effect.void,
        ),
        Effect.catchCause((cause) => Effect.logError("Session sweep failed", cause)),
        Effect.andThen(
          new Date().getUTCMinutes() === ASK_PRUNE_MINUTE
            ? AskService.pruneAskQuestions().pipe(
                Effect.tap((deleted) => (deleted > 0 ? Effect.log(`Ask prune deleted ${deleted}`) : Effect.void)),
                Effect.catchCause((cause) => Effect.logError("Ask prune failed", cause)),
              )
            : Effect.void,
        ),
        Effect.provideService(Database, db),
      ),
    );

    const auth = yield* Auth;
    const sessionFrom = (headers: unknown) =>
      auth.api
        .getSession({
          headers: new Headers(headers as Record<string, string>),
          query: { disableCookieCache: true },
        })
        .pipe(Effect.orDie);
    const tooManyRequests = new TooManyRequests({
      message: "Too many requests. Please wait a minute and try again.",
    });
    const guarded = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(
        Effect.catchDefect((defect) =>
          Effect.logError("RPC failed", defect).pipe(
            Effect.andThen(Effect.die(new Error("Internal server error"))),
          ),
        ),
        Effect.provide(RuntimeContext.phantom),
      );
    const authentication = Layer.succeed(
      Authentication,
      (effect, { headers }) =>
        Effect.gen(function* () {
          const session = yield* sessionFrom(headers);
          if (!session) {
            return yield* new Unauthorized({ message: "Sign in to continue." });
          }
          if (!session.user.username) {
            return yield* new Unauthorized({ message: "Choose a username to continue." });
          }
          const { success } = yield* rpcLimit
            .limit({ key: session.user.id })
            .pipe(Effect.orDie);
          if (!success) return yield* tooManyRequests;
          return yield* Effect.provideService(effect, CurrentUser, {
            id: session.user.id,
            username: session.user.username,
          });
        }).pipe(guarded),
    );

    const optionalAuthentication = Layer.succeed(
      OptionalAuthentication,
      (effect, { headers }) =>
        Effect.gen(function* () {
          const session = yield* sessionFrom(headers);
          const user = session?.user.username
            ? { id: session.user.id, username: session.user.username }
            : null;
          const ip = (headers as Record<string, string | undefined>)["cf-connecting-ip"] ?? "unknown";
          const { success } = yield* (user
            ? rpcLimit.limit({ key: user.id })
            : publicReadLimit.limit({ key: ip })
          ).pipe(Effect.orDie);
          if (!success) return yield* tooManyRequests;
          return yield* Effect.provideService(effect, Viewer, { user });
        }).pipe(guarded),
    );

    const rateLimiter = Layer.succeed(RateLimiter, {
      allow: (limit, userId) =>
        limit === "relay"
          ? Effect.succeed(false)
          : (limit === "connectionRequest" ? connectionRequestLimit : peopleSearchLimit)
              .limit({ key: userId })
              .pipe(
                Effect.map(({ success }) => success),
                Effect.orDie,
                Effect.provide(RuntimeContext.phantom),
              ),
    });

    const authAccounts = Layer.succeed(AuthAccounts, {
      deleteUser: (userId) =>
        Effect.gen(function* () {
          const instance = yield* auth.auth;
          const context = yield* Effect.promise(() => instance.$context);
          yield* Effect.promise(() => context.internalAdapter.deleteUser(userId));
        }).pipe(Effect.provide(RuntimeContext.phantom)),
    });

    const handlers = ApiRpcs.toLayer(apiHandlers).pipe(
      Layer.provide(Layer.mergeAll(Layer.succeed(Database, db), rateLimiter, authAccounts, aiQuota)),
    );

    type Requirements = RuntimeContext | Scope.Scope;
    const serve: Effect.Effect<HttpEffect<Requirements>, never, Requirements> = Effect.gen(
      function* () {
        const rpc = yield* RpcServer.toHttpEffect(ApiRpcs);
        return Effect.gen(function* () {
          const request = yield* HttpServerRequest;
          const path = new URL(request.url, "http://localhost").pathname;
          if (path === "/api/auth" || path.startsWith("/api/auth/")) {
            return yield* auth.fetch;
          }
          return yield* rpc;
        });
      },
    ).pipe(
      Effect.provide(
        Layer.mergeAll(handlers, authentication, optionalAuthentication, RpcSerialization.layerJson),
      ),
    );
    return serve;
  }).pipe(
    Effect.provide(Auth.layer),
    Effect.provide(Cloudflare.Workers.CronEventSourceLive),
    Effect.provide(Cloudflare.Workers.RateLimitBinding),
    Effect.provide(Cloudflare.Hyperdrive.ConnectBinding),
  ),
) {}

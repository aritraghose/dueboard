import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Drizzle from "@alchemy.run/drizzle/Postgres";
// import * as Neon from "@alchemy.run/neon"; // Neon.Connect alternative
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
// import { NeonDatabase } from "./database.ts"; // Neon.Connect alternative
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

/** The minute past each hour when the cron prunes old Ask page questions. */
const ASK_PRUNE_MINUTE = 17;

/**
 * The RPC API. A {@link Cloudflare.Workers.RpcWorker} that serves {@link ApiRpcs}
 * over HTTP (JSON), backed by Drizzle talking to Neon Postgres through a
 * Hyperdrive pool. A direct-to-Neon version (`Neon.Connect`, no Hyperdrive)
 * is kept commented out below. It is bound to the web stack's Website as a private service
 * binding — the browser never reaches it directly; the TanStack `/rpc` route
 * proxies to it (see `web/src/routes/rpc.ts`). It also hosts Better Auth
 * (`./auth.ts`) under `/api/auth/*`, proxied by `web/src/routes/api/auth/$.ts`,
 * and every RPC runs as the signed-in user.
 *
 * The web stack binds this Worker by its Logical ID (`"ApiWorker"`) through
 * the `ApiWorker` reference in `./Stack.ts` — keep the two in sync.
 */
export default class ApiWorker extends Cloudflare.Workers.RpcWorker<ApiWorker>()(
  "ApiWorker",
  {
    main: import.meta.filename,
    workersDev: false, // no workers.dev URL; we use the service binding instead
    dev: { port: DEV_PORTS.ApiWorker },
    schema: ApiRpcs,
  },
  Effect.gen(function* () {
    // Hyperdrive: Cloudflare's connection pool in front of Neon, so each
    // request reuses warm connections instead of opening a new one.
    const conn = yield* Cloudflare.Hyperdrive.Connect(Hyperdrive);
    const db = yield* Drizzle.Postgres(conn.connectionString, { relations });

    // Neon.Connect alternative (no Hyperdrive): hands the Worker the branch's
    // pooled connection string as a secret. Every request then opens a new
    // Postgres connection, which is slow when the database is far away. To use
    // it, replace the two lines above with these three, swap the
    // `Effect.provide(...)` at the end of this Worker, and uncomment the
    // `Neon` and `NeonDatabase` imports.
    // const { branch } = yield* NeonDatabase;
    // const conn = yield* Neon.Connect(branch);
    // const db = yield* Drizzle.Postgres(conn.connectionString, { relations });

    // Rate Limiting bindings, configured in `./limits.ts` (architecture.md
    // §9). The per-user RPC budget keeps one account from flooding the
    // database; the others guard social writes, search and public reads.
    const rateLimit = (spec: (typeof LIMITS)[keyof typeof LIMITS]) =>
      Cloudflare.RateLimit(spec.name, bindingProps(spec));
    const rpcLimit = yield* rateLimit(LIMITS.rpc);
    const connectionRequestLimit = yield* rateLimit(LIMITS.connectionRequest);
    const peopleSearchLimit = yield* rateLimit(LIMITS.peopleSearch);
    const publicReadLimit = yield* rateLimit(LIMITS.publicRead);

    // The monthly AI quota in messages (architecture.md §8). Set
    // `AI_MONTHLY_MESSAGE_QUOTA` where you deploy to change it; without it
    // nothing is bound and the default applies. `user_settings.ai_quota_override`
    // replaces it for one user.
    const monthlyMessages = yield* Config.Int("AI_MONTHLY_MESSAGE_QUOTA").pipe(
      Config.withDefault(AI_MONTHLY_MESSAGE_QUOTA_DEFAULT),
    );
    const aiQuota = Layer.succeed(AiQuota, { monthlyMessages });

    // The focus-session sweep (architecture.md §11): every minute, complete
    // the running sessions whose time ran out, even with the app closed.
    // Reads also complete them lazily, so a late or missed run only delays
    // the `session_completed` activity. Failures are logged, never thrown:
    // the next minute's run retries, and a run is safe to repeat.
    // Once an hour, the same cron also deletes Ask page questions past
    // their 30 days (`domain/ask.ts`); reads already hide them.
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

    // Resolves the session for each RPC from the cookies the web
    // stack's `/rpc` proxy forwards, and runs the handler as that user.
    const auth = yield* Auth;
    // RPCs skip Better Auth's cookie cache and read the session from the
    // database, so a revoked session loses data access at once. Route
    // guards still use the cache.
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
    // Defects (database or session lookup failures) would reach the browser
    // with their message and cause, which can include SQL and connection
    // details. Log them here and send a generic defect. RPC handlers don't
    // carry Alchemy's runtime marker; the Worker owns the request scope
    // (same as the HttpApi middleware in Alchemy's Better Auth example).
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

    // `PublicRpcs`: the session if there is one, never required. Signed-in
    // viewers share the per-user RPC budget; logged-out visitors are
    // limited by IP (Cloudflare sets `cf-connecting-ip`, and the website's
    // `/rpc` proxy forwards the request's headers unchanged).
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

    // The limits domain services check themselves, so Tibo's tools (step
    // 18) are held to them too.
    const rateLimiter = Layer.succeed(RateLimiter, {
      allow: (limit, userId) =>
        // Relays are sent only by Tibo, through the DomainWorker, which binds their limit.
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

    // Better Auth's side of account deletion: its internal adapter removes
    // the user with their sessions and linked accounts. Signing out after
    // that clears the cookies (and the cached session copy).
    const authAccounts = Layer.succeed(AuthAccounts, {
      deleteUser: (userId) =>
        Effect.gen(function* () {
          const instance = yield* auth.auth;
          const context = yield* Effect.promise(() => instance.$context);
          yield* Effect.promise(() => context.internalAdapter.deleteUser(userId));
        }).pipe(Effect.provide(RuntimeContext.phantom)),
    });

    // The RPC handlers (`./handlers.ts`), shared with the DomainWorker.
    const handlers = ApiRpcs.toLayer(apiHandlers).pipe(
      Layer.provide(Layer.mergeAll(Layer.succeed(Database, db), rateLimiter, authAccounts, aiQuota)),
    );

    // One Worker serves two things: Better Auth's routes (proxied by the
    // web stack's `/api/auth/*` route) and the RPCs (proxied by `/rpc`).
    // Tibo reaches the same handlers through the DomainWorker, not here.
    // The RPC server forks into its own scope, while Better Auth needs the
    // runtime context of the request; the annotation names both so the
    // RpcWorker accepts the result.
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
  // Neon.Connect alternative: use `Neon.ConnectHttp` instead of
  // `Cloudflare.Hyperdrive.ConnectBinding` above (Auth keeps Hyperdrive).
) {}

import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Drizzle from "@alchemy.run/drizzle/Postgres";
// import * as Neon from "@alchemy.run/neon"; // Neon.Connect alternative
import { RuntimeContext } from "alchemy";
import type { HttpEffect } from "alchemy/Http";
import * as Effect from "effect/Effect";
import { HttpServerRequest } from "effect/http/HttpServerRequest";
import * as Layer from "effect/Layer";
import type * as Scope from "effect/Scope";
import { RpcSerialization, RpcServer } from "effect/rpc";
import { Auth } from "./auth.ts";
import { Hyperdrive } from "./database.ts";
import { Database } from "./domain/database.ts";
import * as SettingsService from "./domain/settings.ts";
import * as TagsService from "./domain/tags.ts";
// import { NeonDatabase } from "./database.ts"; // Neon.Connect alternative
import {
  ApiRpcs,
  Authentication,
  BootstrapResult,
  CurrentUser,
  TooManyRequests,
  Unauthorized,
} from "./rpc.ts";
import { relations } from "./schema.ts";

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

    // Per-user budget for RPCs, so one account can't flood the database.
    // Like the web stack's `AUTH_RATE_LIMIT`, counting is approximate and per
    // Cloudflare location. `namespaceId` must be unique within the account.
    const rpcLimit = yield* Cloudflare.RateLimit("RPC_RATE_LIMIT", {
      namespaceId: 1004,
      simple: { limit: 120, period: 60 },
    });

    // Resolves the session for each RPC from the cookies the web
    // stack's `/rpc` proxy forwards, and runs the handler as that user.
    const auth = yield* Auth;
    const authentication = Layer.succeed(
      Authentication,
      (effect, { headers }) =>
        Effect.gen(function* () {
          // RPCs skip Better Auth's cookie cache and read the session
          // from the database, so a revoked session loses data access at
          // once. Route guards still use the cache.
          const session = yield* auth.api
            .getSession({
              headers: new Headers(headers as Record<string, string>),
              query: { disableCookieCache: true },
            })
            .pipe(Effect.orDie);
          if (!session) {
            return yield* new Unauthorized({ message: "Sign in to continue." });
          }
          if (!session.user.username) {
            return yield* new Unauthorized({ message: "Choose a username to continue." });
          }
          const { success } = yield* rpcLimit
            .limit({ key: session.user.id })
            .pipe(Effect.orDie);
          if (!success) {
            return yield* new TooManyRequests({
              message: "Too many requests. Please wait a minute and try again.",
            });
          }
          return yield* Effect.provideService(effect, CurrentUser, {
            id: session.user.id,
            username: session.user.username,
          });
        }).pipe(
          // Defects (database or session lookup failures) would reach the
          // browser with their message and cause, which can include SQL and
          // connection details. Log them here and send a generic defect.
          Effect.catchDefect((defect) =>
            Effect.logError("RPC failed", defect).pipe(
              Effect.andThen(Effect.die(new Error("Internal server error"))),
            ),
          ),
          // RPC handlers don't carry Alchemy's runtime marker; the Worker
          // owns the request scope (same as the HttpApi middleware in
          // Alchemy's Better Auth example).
          Effect.provide(RuntimeContext.phantom),
        ),
    );

    // One handler per RPC in `ApiRpcs`, each running as `CurrentUser`.
    // Handlers stay thin: the rules live in the domain services
    // (`./domain/`), which take the acting user id explicitly, query through
    // `Database`, and turn database errors into defects, so each handler's
    // error channel matches its RPC schema.
    const handlers = ApiRpcs.toLayer({
      Bootstrap: ({ timeZone }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return new BootstrapResult(yield* SettingsService.bootstrap(user.id, timeZone));
        }),
      UpdateSettings: (patch) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* SettingsService.updateSettings(user.id, patch);
        }),
      ListTags: () =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* TagsService.listTags(user.id);
        }),
      CreateTag: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* TagsService.createTag(user.id, input);
        }),
      UpdateTag: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* TagsService.updateTag(user.id, input);
        }),
      DeleteTag: ({ id }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* TagsService.deleteTag(user.id, id);
        }),
    }).pipe(Layer.provide(Layer.succeed(Database, db)));

    // One Worker serves two things: Better Auth's routes (proxied by the web
    // stack's `/api/auth/*` route) and the RPCs (proxied by `/rpc`).
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
    ).pipe(Effect.provide(Layer.mergeAll(handlers, authentication, RpcSerialization.layerJson)));
    return serve;
  }).pipe(
    Effect.provide(Auth.layer),
    Effect.provide(Cloudflare.Workers.RateLimitBinding),
    Effect.provide(Cloudflare.Hyperdrive.ConnectBinding),
  ),
  // Neon.Connect alternative: use `Neon.ConnectHttp` instead of
  // `Cloudflare.Hyperdrive.ConnectBinding` above (Auth keeps Hyperdrive).
) {}

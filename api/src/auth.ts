import { BetterAuth } from "@alchemy.run/better-auth";
import { CloudflareHyperdrive } from "@alchemy.run/better-auth/CloudflareHyperdrive";
import { ALCHEMY_DEV } from "alchemy";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { username } from "better-auth/plugins";
// Lets `tsc` name the zod types inside Better Auth's endpoint signatures
// when it emits `lib/auth.d.ts` (TS2883 otherwise).
import type {} from "zod/v4/core";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import { Hyperdrive, NeonDatabase } from "./database.ts";

/**
 * Better Auth, hosted by the ApiWorker and reached through the web stack's
 * `/api/auth/*` proxy. Google is the only sign-in method; the `username`
 * plugin adds the unique `user.username` that `/onboarding` sets.
 *
 * Config is read here, during Worker init, so Alchemy binds it into the
 * Worker at deploy. Alchemy reads it from `api/.env` (or `--env-file`).
 * `AUTH_BASE_URL` is required to deploy. Under `alchemy dev` it may be
 * unset, and Better Auth derives its origin from each request, which is the
 * website's origin because the proxy forwards the browser's request
 * unchanged.
 */
const makeAuth = Effect.gen(function* () {
  const baseURL = yield* Config.String("AUTH_BASE_URL").pipe(Config.option);
  // A deployed stage must name its origin. Otherwise Better Auth trusts
  // every hostname that reaches the Worker (workers.dev, preview URLs,
  // custom domains) for redirects and its origin check. This runs at
  // deploy only; `alchemy dev` may leave it unset (the dev port changes).
  if (!globalThis.__ALCHEMY_RUNTIME__ && !(yield* ALCHEMY_DEV)) {
    if (Option.isNone(baseURL)) {
      return yield* Effect.die(
        new Error(
          "AUTH_BASE_URL is required to deploy: set it in api/.env (or --env-file) to the website's origin.",
        ),
      );
    }
    const url = URL.canParse(baseURL.value) ? new URL(baseURL.value) : undefined;
    if (url?.protocol !== "https:" || url.origin !== baseURL.value) {
      return yield* Effect.die(
        new Error(
          `AUTH_BASE_URL must be an https origin without a path or trailing slash, got "${baseURL.value}".`,
        ),
      );
    }
  }
  const google = {
    clientId: yield* Config.String("GOOGLE_CLIENT_ID"),
    clientSecret: Redacted.value(yield* Config.Redacted("GOOGLE_CLIENT_SECRET")),
  };

  return yield* BetterAuth({
    basePath: "/api/auth",
    baseURL: Option.getOrUndefined(baseURL),
    socialProviders: { google },
    plugins: [username()],
    session: {
      // Keep a signed copy of the session in a cookie for 5 minutes, so most
      // session checks (route guards, todo RPCs) skip the database. Signing
      // out clears it at once; a session revoked from another device stays
      // usable there until the copy expires.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    account: {
      // The app never calls Google APIs, but Better Auth still stores the
      // OAuth tokens; encrypt them at rest with the signing secret.
      encryptOAuthTokens: true,
    },
    // Better Auth picks these defaults from NODE_ENV, which Workers don't
    // set, so state them explicitly.
    advanced: {
      // `Secure` cookies with the `__Secure-` prefix. Browsers accept them on
      // http://localhost too.
      useSecureCookies: true,
      // Record the client IP Cloudflare sets, which clients can't spoof.
      // Better Auth's default, `x-forwarded-for`, is whatever the client sent.
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    hooks: {
      // The `username` plugin leaves its availability check public, so anyone
      // could test names to list the accounts. Only signed-in users (who are
      // choosing a username at `/onboarding`) may ask.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/is-username-available") return;
        const session = await getSessionFromCtx(ctx);
        if (!session) throw new APIError("UNAUTHORIZED", { message: "Sign in to continue." });
      }),
    },
    // Abuse protection is Cloudflare's Rate Limiting binding on the website's
    // `/api/auth/*` proxy (web/alchemy.run.ts), which sees the client IP.
    // Better Auth's own limiter would count every request from the web
    // worker as one client.
    rateLimit: { enabled: false },
  });
});

export class Auth extends Context.Service<Auth, Effect.Success<typeof makeAuth>>()("api/Auth") {
  /**
   * Auth over the same Hyperdrive pool as the todos. Hyperdrive's connection
   * string only exists inside the Worker, so deploy-time schema migrations
   * connect to the Neon branch directly.
   */
  static readonly layer = Layer.effect(Auth, makeAuth).pipe(
    Layer.provide(
      Layer.unwrap(
        Effect.gen(function* () {
          const { branch } = yield* NeonDatabase;
          return CloudflareHyperdrive(Hyperdrive, { migrate: branch.connectionUri });
        }),
      ),
    ),
  );
}

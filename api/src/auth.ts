import { BetterAuth } from "@alchemy.run/better-auth";
import { CloudflareHyperdrive } from "@alchemy.run/better-auth/CloudflareHyperdrive";
import { ALCHEMY_DEV } from "alchemy";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { username } from "better-auth/plugins";
import type {} from "zod/v4/core";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import { Hyperdrive, NeonDatabase } from "./database.ts";

const makeAuth = Effect.gen(function* () {
  const baseURL = yield* Config.String("AUTH_BASE_URL").pipe(Config.option);
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
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    account: {
      encryptOAuthTokens: true,
    },
    advanced: {
      useSecureCookies: true,
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/is-username-available") return;
        const session = await getSessionFromCtx(ctx);
        if (!session) throw new APIError("UNAUTHORIZED", { message: "Sign in to continue." });
      }),
    },
    rateLimit: { enabled: false },
  });
});

export class Auth extends Context.Service<Auth, Effect.Success<typeof makeAuth>>()("api/Auth") {
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

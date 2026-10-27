import * as Cloudflare from "@alchemy.run/cloudflare";
import { ApiWorker } from "@dueboard/api";
import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";

/**
 * The TanStack Start frontend. Deployed as a Cloudflare Worker + static assets
 * by `Cloudflare.Website.Vite`. The Api stack's `ApiWorker` RPC worker is
 * injected by reference as a private `API` service binding; the `/rpc`
 * server route proxies the browser's `AtomRpc` traffic to it.
 */
export class Website extends Cloudflare.Website.Vite<Website>()("Website", {
  compatibility: {
    // Node.js compatibility is supplied by Alchemy's 2026-08-31 default.
    flags: ["enable_request_signal"],
  },
  env: {
    API: ApiWorker,
    // Per-client-IP budget for Better Auth's routes (`/api/auth/*`), checked
    // in `src/routes/api/auth/$.ts`. Counting is approximate and per
    // Cloudflare location: abuse protection, not an exact quota.
    // `namespaceId` must be unique within the Cloudflare account.
    AUTH_RATE_LIMIT: Cloudflare.RateLimit("AUTH_RATE_LIMIT", {
      namespaceId: 1003,
      simple: { limit: 30, period: 60 },
    }),
  },
}) {}

export type WebsiteEnv = Cloudflare.InferEnv<typeof Website>;

export default Alchemy.Stack(
  "DueboardWeb",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    // The Api stack must already be deployed to this stage — otherwise the
    // `ApiWorker` reference fails the plan with `InvalidReferenceError`.
    const website = yield* Website;

    return {
      websiteUrl: website.url.as<string>(),
    };
  }),
);

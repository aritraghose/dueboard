import * as Cloudflare from "@alchemy.run/cloudflare";
import { AgentWorker, ApiWorker, LIMITS, bindingProps } from "@dueboard/api";
import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";

/**
 * The TanStack Start frontend. Deployed as a Cloudflare Worker + static assets
 * by `Cloudflare.Website.Vite`. The Api stack's `ApiWorker` RPC worker is
 * injected by reference as a private `API` service binding; the `/rpc`
 * server route proxies the browser's `AtomRpc` traffic to it. Its
 * `AgentWorker` is bound the same way as `AGENT`, for the chat agent.
 */
export class Website extends Cloudflare.Website.Vite<Website>()("Website", {
  compatibility: {
    // Node.js compatibility is supplied by Alchemy's 2026-08-31 default.
    flags: ["enable_request_signal"],
  },
  env: {
    API: ApiWorker,
    // The Api stack's chat agent, reached through `src/server.ts`'s
    // `/agents/*` proxy.
    AGENT: AgentWorker,
    // Per-client-IP budgets, from the registry in `api/src/limits.ts`
    // (architecture.md §9): Better Auth's routes (`src/routes/api/auth/$.ts`),
    // the `/agents/*` proxy and everything else (both in `src/server.ts`).
    AUTH_RATE_LIMIT: Cloudflare.RateLimit(LIMITS.auth.name, bindingProps(LIMITS.auth)),
    AGENT_RATE_LIMIT: Cloudflare.RateLimit(LIMITS.agent.name, bindingProps(LIMITS.agent)),
    WEB_RATE_LIMIT: Cloudflare.RateLimit(LIMITS.web.name, bindingProps(LIMITS.web)),
  },
}) {}

// `InferEnv` has no case for a plain Worker, so it types `AGENT` as the Worker
// resource. At runtime it's a service binding.
export type WebsiteEnv = Omit<Cloudflare.InferEnv<typeof Website>, "AGENT"> & {
  AGENT: Fetcher;
};

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

import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Effect from "effect/Effect";

/**
 * The AI Gateway every model call goes through. The chat model is a
 * third-party catalog model (Meta's Muse Spark), paid for with our own Meta
 * key (BYOK) rather than Cloudflare's Unified Billing: add the key in the
 * dashboard under AI Gateway → this gateway → Provider Keys, with the
 * `default` alias, and turn on Settings → Require provider credentials.
 * `./agent.ts` also sends `cf-aig-no-wholesale` on every request, so a
 * missing key fails the request instead of falling back to Unified Billing.
 */
export const Gateway = Cloudflare.AI.Gateway("Gateway", {
  // BYOK keys are only used on an authenticated gateway.
  authentication: true,
  collectLogs: true,
});

/**
 * The chat agent: a plain async Worker (`./agent.ts`) that hosts the
 * `ChatAgent` Durable Object, one instance per user. Like the ApiWorker it
 * has no public URL; the web stack reaches it over a service binding through
 * its `/agents/*` proxy (`web/src/server.ts`), which signs the user in and
 * pins the instance to their user id.
 *
 * The web stack binds this Worker by its Logical ID (`"AgentWorker"`) through
 * the `AgentWorker` reference in `./Stack.ts` — keep the two in sync.
 */
const AgentWorker = Cloudflare.Worker("AgentWorker", {
  main: `${import.meta.dirname}/agent.ts`,
  workersDev: false,
  env: {
    AI: Cloudflare.Workers.AI(),
    AI_GATEWAY_ID: Effect.map(Gateway, (gateway) => gateway.gatewayId),
    ChatAgent: Cloudflare.DurableObject("ChatAgent"),
    // Per-user budget for chat turns, checked in `ChatAgent.onChatMessage`.
    // Each turn is a paid model call, and chat messages arrive over the
    // WebSocket, past the web stack's HTTP rate limits. `namespaceId` must be
    // unique within the Cloudflare account.
    CHAT_RATE_LIMIT: Cloudflare.RateLimit("CHAT_RATE_LIMIT", {
      namespaceId: 1005,
      simple: { limit: 10, period: 60 },
    }),
  },
});

export default AgentWorker;

export type AgentEnv = Cloudflare.InferEnv<typeof AgentWorker>;

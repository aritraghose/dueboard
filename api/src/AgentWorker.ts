import * as Cloudflare from "@alchemy.run/cloudflare";
import { ALCHEMY_DEV } from "alchemy";
import * as Effect from "effect/Effect";
import type { DomainBinding } from "./domain-client.ts";
import { DEV_PORTS } from "./dev-ports.ts";
import DomainWorker from "./DomainWorker.ts";
import { LIMITS, bindingProps } from "./limits.ts";
import { EMBEDDING_DIMENSIONS } from "./tibo/embeddings.ts";

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
 * Tibo's long-term memory (architecture.md §7.2): embeddings of the user's
 * memories and of chunks of their thread, from `EMBEDDING_MODEL`
 * (`./tibo/embeddings.ts`). One namespace per user (their id). Each vector
 * id maps back to a row in that user's `TiboAgent` SQLite (`m:<memory id>`
 * or `c:<chunk id>`), so the agent can list and delete its own vectors.
 *
 * Immutable: a new model with other dimensions means a new index and
 * re-embedding every row (rows remember their `embedding_model`).
 */
export const MemoryIndex = Cloudflare.Vectorize.Index("TiboMemory", {
  dimensions: EMBEDDING_DIMENSIONS,
  metric: "cosine",
  description: "Tibo memories and thread chunks, one namespace per user",
});

/**
 * The metadata `TiboAgent` filters on: `type` (`memory` | `message`), `kind`
 * (a memory's kind) and `created_at` (ms, for date-bounded conversation
 * search). Only vectors written after these exist are filterable, so the
 * stack creates them alongside the index.
 */
export const MEMORY_METADATA = [
  { id: "TiboMemoryType", propertyName: "type", indexType: "string" },
  { id: "TiboMemoryKind", propertyName: "kind", indexType: "string" },
  { id: "TiboMemoryCreatedAt", propertyName: "created_at", indexType: "number" },
] as const;

/**
 * Tibo's Worker: a plain async Worker (`./agent.ts`) that hosts the
 * `TiboAgent` Durable Object (`./tibo/TiboAgent.ts`), one instance per user. Like the ApiWorker it
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
  dev: { port: DEV_PORTS.AgentWorker },
  env: {
    AI: Cloudflare.Workers.AI(),
    AI_GATEWAY_ID: Effect.map(Gateway, (gateway) => gateway.gatewayId),
    // Replaces the demo `ChatAgent`: dropping its binding makes Alchemy
    // send a `deleted_classes` migration for it (its demo chats go with it)
    // and a `new_sqlite_classes` one for this class.
    TiboAgent: Cloudflare.DurableObject("TiboAgent"),
    // Per-user budget for Tibo turns, checked in `TiboAgent.turn`.
    // Each turn is a paid model call, and chat messages arrive over the
    // WebSocket, past the web stack's HTTP rate limits (`./limits.ts`).
    CHAT_RATE_LIMIT: Cloudflare.RateLimit(LIMITS.chat.name, bindingProps(LIMITS.chat)),
    // The domain services, as this agent's user only (`./DomainWorker.ts`):
    // Tibo's tools, the today snapshot, the AI quota ledger, the profile
    // facts and the wipe queue. Bound here and nowhere else.
    DOMAIN: DomainWorker,
    // Long-term memory vectors (namespace = user id).
    MEMORY: MemoryIndex,
    // "true" under `alchemy dev`: logs context sizes, raises the memory
    // jobs' daily cap and turns on the `dev/*` routes (seeding a thread).
    TIBO_DEV: Effect.map(ALCHEMY_DEV, (dev) => (dev ? "true" : "false")),
  },
  // Wipes deleted accounts' Tibo threads (`./agent.ts`).
  crons: ["*/5 * * * *"],
});

export default AgentWorker;

// The DomainWorker's methods are typed by `DomainBinding`: `InferEnv` would
// give their Effect signatures, and the agent awaits plain promises.
// `InferEnv` (beta.84) types a Vectorize binding as the resource, so
// `MEMORY` is typed as the runtime binding here.
export type AgentEnv = Omit<Cloudflare.InferEnv<typeof AgentWorker>, "DOMAIN" | "MEMORY"> & {
  DOMAIN: DomainBinding;
  MEMORY: Vectorize;
};

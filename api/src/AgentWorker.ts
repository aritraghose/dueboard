import * as Cloudflare from "@alchemy.run/cloudflare";
import { ALCHEMY_DEV } from "alchemy";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import type { DomainBinding } from "./domain-client.ts";
import { DEV_PORTS } from "./dev-ports.ts";
import DomainWorker from "./DomainWorker.ts";
import { LIMITS, bindingProps } from "./limits.ts";
import { TURNSTILE_TEST_SECRET, TURNSTILE_TEST_SITE_KEY } from "./ask/turnstile.ts";
import { EMBEDDING_DIMENSIONS } from "./tibo/embeddings.ts";

export const Gateway = Cloudflare.AI.Gateway("Gateway", {
  authentication: true,
  collectLogs: true,
});

export const MemoryIndex = Cloudflare.Vectorize.Index("TiboMemory", {
  dimensions: EMBEDDING_DIMENSIONS,
  metric: "cosine",
  description: "Tibo memories and thread chunks, one namespace per user",
});

export const MEMORY_METADATA = [
  { id: "TiboMemoryType", propertyName: "type", indexType: "string" },
  { id: "TiboMemoryKind", propertyName: "kind", indexType: "string" },
  { id: "TiboMemoryCreatedAt", propertyName: "created_at", indexType: "number" },
] as const;

export const TiboFiles = Cloudflare.R2.Bucket("TiboFiles", {
  publicAccess: false,
  lifecycleRules: [
    { id: "abort-incomplete-uploads", abortMultipartUploadsTransition: { condition: { type: "Age", maxAge: 24 * 60 * 60 } } },
  ],
});

const siteHostname = Effect.gen(function* () {
  const baseURL = yield* Config.String("AUTH_BASE_URL");
  if (!URL.canParse(baseURL)) {
    return yield* Effect.die(new Error(`AUTH_BASE_URL must be the website's https origin, got "${baseURL}".`));
  }
  return new URL(baseURL).hostname;
});

export const AskTurnstile = Effect.flatMap(siteHostname, (hostname) =>
  Cloudflare.Turnstile.Widget("AskTurnstile", { domains: [hostname], mode: "managed" }),
);

const turnstile = (dev: string | Redacted.Redacted<string>, deployed: (widget: Effect.Success<typeof AskTurnstile>) => unknown) =>
  Effect.flatMap(ALCHEMY_DEV, (isDev): Effect.Effect<unknown, never, never> =>
    isDev ? Effect.succeed(dev) : (Effect.map(AskTurnstile, deployed) as Effect.Effect<unknown, never, never>),
  ) as unknown as Effect.Effect<string>;

const AgentWorker = Cloudflare.Worker("AgentWorker", {
  main: `${import.meta.dirname}/agent.ts`,
  workersDev: false,
  dev: { port: DEV_PORTS.AgentWorker },
  env: {
    AI: Cloudflare.Workers.AI(),
    AI_GATEWAY_ID: Effect.map(Gateway, (gateway) => gateway.gatewayId),
    TiboAgent: Cloudflare.DurableObject("TiboAgent"),
    CHAT_RATE_LIMIT: Cloudflare.RateLimit(LIMITS.chat.name, bindingProps(LIMITS.chat)),
    AskAgent: Cloudflare.DurableObject("AskAgent"),
    ASK_RATE_LIMIT: Cloudflare.RateLimit(LIMITS.ask.name, bindingProps(LIMITS.ask)),
    TURNSTILE_SITE_KEY: turnstile(TURNSTILE_TEST_SITE_KEY, (widget) => widget.sitekey),
    TURNSTILE_SECRET: turnstile(Redacted.make(TURNSTILE_TEST_SECRET), (widget) => widget.secret),
    TURNSTILE_HOSTNAMES: Effect.flatMap(ALCHEMY_DEV, (isDev) => (isDev ? Effect.succeed("") : siteHostname)),
    DOMAIN: DomainWorker,
    MEMORY: MemoryIndex,
    TIBO_FILES: TiboFiles,
    TIBO_DEV: Effect.map(ALCHEMY_DEV, (dev) => (dev ? "true" : "false")),
  },
  crons: ["* * * * *"],
});

export default AgentWorker;

export type AgentEnv = Omit<
  Cloudflare.InferEnv<typeof AgentWorker>,
  "DOMAIN" | "MEMORY" | "TURNSTILE_SECRET" | "TURNSTILE_SITE_KEY" | "TURNSTILE_HOSTNAMES"
> & {
  DOMAIN: DomainBinding;
  MEMORY: Vectorize;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET: string;
  TURNSTILE_HOSTNAMES: string;
};

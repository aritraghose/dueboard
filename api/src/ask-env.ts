import type { AgentEnv } from "./AgentWorker.ts";
import type { AskEnv } from "./ask/AskAgent.ts";
import { askPort } from "./domain-client.ts";

export const askEnv = (env: AgentEnv): AskEnv =>
  Object.freeze({
    AI: env.AI,
    AI_GATEWAY_ID: env.AI_GATEWAY_ID,
    ASK: askPort(env.DOMAIN),
    ASK_RATE_LIMIT: env.ASK_RATE_LIMIT,
    TURNSTILE_SITE_KEY: env.TURNSTILE_SITE_KEY,
    TURNSTILE_SECRET: env.TURNSTILE_SECRET,
    TURNSTILE_HOSTNAMES: Object.freeze(
      env.TURNSTILE_HOSTNAMES.split(",")
        .map((hostname) => hostname.trim())
        .filter(Boolean),
    ),
  });

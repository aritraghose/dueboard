import type { AgentEnv } from "./AgentWorker.ts";
import type { AskEnv } from "./ask/AskAgent.ts";
import { askPort } from "./domain-client.ts";

/**
 * The Ask agent's whole world, picked out of the Worker's env
 * (architecture.md §7.6): the model, its rate limit, Turnstile's keys, and
 * `ASK`, a frozen pair of functions over the DomainWorker that only answer
 * about one owner's Ask page. The `DOMAIN` binding itself, Tibo's agents
 * and the memory index are left behind, so nothing in the Ask agent can
 * reach them.
 */
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

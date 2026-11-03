/// <reference types="@cloudflare/workers-types" />

import { createOpenAI } from "@ai-sdk/openai";

/** Meta's Muse Spark, from the AI Gateway model catalog. */
export const MODEL = "meta/muse-spark-1.3";

/**
 * The parts of `env.AI.run` used here. Its published types list neither this
 * model nor the `openaiEndpoint` option, which picks the request format for a
 * catalog model.
 */
type AiRun = (
  model: string,
  inputs: unknown,
  options: {
    gateway: { id: string; metadata?: Record<string, string> };
    extraHeaders?: Record<string, string>;
    openaiEndpoint: "/v1/responses";
    returnRawResponse: true;
    signal?: AbortSignal | null;
  },
) => Promise<Response>;

/**
 * Muse Spark only speaks the OpenAI Responses format, and `agents`' own
 * `createAI` reads every catalog model as Chat Completions, which drops its
 * replies. So the AI SDK's OpenAI provider builds and parses Responses
 * requests, and its `fetch` sends them to `/run` through the AI binding and
 * the gateway, which adds the stored Meta key (BYOK).
 */
export function museSpark(env: { AI: Ai; AI_GATEWAY_ID: string }, userId: string) {
  const run = env.AI.run.bind(env.AI) as unknown as AiRun;
  const meta = createOpenAI({
    // Never sent: the binding authenticates, and the gateway adds Meta's key.
    apiKey: "byok",
    // Bun's `fetch` type adds `preconnect`, which a custom fetch never needs.
    fetch: (async (_url: unknown, init?: RequestInit) =>
      run(MODEL, JSON.parse(String(init?.body)), {
        gateway: { id: env.AI_GATEWAY_ID, metadata: { userId } },
        // BYOK only: without a stored Meta key, fail instead of billing the
        // request through Unified Billing.
        extraHeaders: { "cf-aig-no-wholesale": "true" },
        openaiEndpoint: "/v1/responses",
        returnRawResponse: true,
        signal: init?.signal,
      })) as typeof fetch,
  });
  return meta.responses(MODEL);
}

/// <reference types="@cloudflare/workers-types" />

import { createOpenAI, type OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import type { LanguageModelUsage } from "ai";

export const MODEL = "meta/muse-spark-1.3";

export type MusePurpose = "reply" | "memory" | "ask";

export const REASONING_EFFORT: Record<MusePurpose, "minimal" | "low" | "medium" | "high"> = {
  reply: "low",
  memory: "low",
  ask: "low",
};

export function museOptions(purpose: MusePurpose, { summary = false }: { summary?: boolean } = {}) {
  const openai: OpenAIResponsesProviderOptions = {
    forceReasoning: true,
    systemMessageMode: "system",
    reasoningEffort: REASONING_EFFORT[purpose],
    reasoningSummary: summary ? "auto" : null,
  };
  return { openai };
}

export function logMuseUsage(purpose: MusePurpose, usage: LanguageModelUsage, ms: number, step?: number) {
  const input = usage.inputTokens ?? 0;
  const cached = usage.inputTokenDetails.cacheReadTokens ?? 0;
  console.log("Muse usage", {
    purpose,
    ...(step !== undefined ? { step } : {}),
    effort: REASONING_EFFORT[purpose],
    input,
    cached,
    cachedPct: input > 0 ? Math.round((cached / input) * 100) : 0,
    output: usage.outputTokens ?? 0,
    reasoning: usage.outputTokenDetails.reasoningTokens ?? 0,
    ms,
  });
}

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

export function museSpark(
  env: { AI: Ai; AI_GATEWAY_ID: string },
  userId: string,
  purpose: MusePurpose = "reply",
) {
  const run = env.AI.run.bind(env.AI) as unknown as AiRun;
  const meta = createOpenAI({
    apiKey: "byok",
    fetch: (async (_url: unknown, init?: RequestInit) =>
      run(MODEL, JSON.parse(String(init?.body)), {
        gateway: { id: env.AI_GATEWAY_ID, metadata: { userId, purpose } },
        extraHeaders: { "cf-aig-no-wholesale": "true" },
        openaiEndpoint: "/v1/responses",
        returnRawResponse: true,
        signal: init?.signal,
      })) as typeof fetch,
  });
  return meta.responses(MODEL);
}

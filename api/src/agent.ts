/// <reference types="@cloudflare/workers-types" />

import { createOpenAI } from "@ai-sdk/openai";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
import { convertToModelMessages, pruneMessages, streamText } from "ai";
import type { AgentEnv } from "./AgentWorker.ts";

/** Meta's Muse Spark, from the AI Gateway model catalog. */
const MODEL = "meta/muse-spark-1.3";

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
function museSpark(env: AgentEnv, userId: string) {
  const run = env.AI.run.bind(env.AI) as unknown as AiRun;
  const meta = createOpenAI({
    // Never sent: the binding authenticates, and the gateway adds Meta's key.
    apiKey: "byok",
    fetch: async (_url, init) =>
      run(MODEL, JSON.parse(String(init?.body)), {
        gateway: { id: env.AI_GATEWAY_ID, metadata: { userId } },
        // BYOK only: without a stored Meta key, fail instead of billing the
        // request through Unified Billing.
        extraHeaders: { "cf-aig-no-wholesale": "true" },
        openaiEndpoint: "/v1/responses",
        returnRawResponse: true,
        signal: init?.signal,
      }),
  });
  return meta.responses(MODEL);
}

const SYSTEM_PROMPT = `You are the assistant inside Dueboard, an app that keeps everything that's due on one board.
Help the user plan, prioritise and break down their work. Be concise and concrete.
Format replies in Markdown, and use fenced code blocks with a language for any code.`;

/**
 * One persistent chat per user. The Agents SDK stores the transcript in the
 * Durable Object's SQLite and streams replies over a WebSocket, resuming the
 * stream if the browser reconnects mid-reply. The instance name is the user
 * id, set by the web stack's `/agents/*` proxy, never by the browser.
 */
export class ChatAgent extends AIChatAgent<AgentEnv> {
  maxPersistedMessages = 200;

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const { success } = await this.env.CHAT_RATE_LIMIT.limit({ key: this.name });
    if (!success) {
      throw new Error("Too many messages. Please wait a minute and try again.");
    }

    const result = streamText({
      model: museSpark(this.env, this.name),
      system: SYSTEM_PROMPT,
      // Drop old reasoning from the history so long chats stay cheap.
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        reasoning: "before-last-message",
      }),
      abortSignal: options?.abortSignal,
    });

    return result.toUIMessageStreamResponse();
  }
}

export default {
  async fetch(request: Request, env: AgentEnv) {
    // `/agents/chat-agent/<user id>/…`, rewritten by the web stack's proxy.
    return (await routeAgentRequest(request, env)) ?? new Response("Not found", { status: 404 });
  },
};

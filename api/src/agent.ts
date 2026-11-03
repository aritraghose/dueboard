/// <reference types="@cloudflare/workers-types" />

import { createOpenAI } from "@ai-sdk/openai";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  pruneMessages,
  streamText,
  type UIMessage,
} from "ai";
import type { AgentEnv } from "./AgentWorker.ts";
import { AI_LIMIT_REACHED, AI_UNITS_PER_MESSAGE } from "./domain/usage-constants.ts";
import { usageClient } from "./internal-client.ts";
import { MAX_CHAT_MESSAGE_LENGTH } from "./limits.ts";

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

const SYSTEM_PROMPT = `You are the assistant inside Dueboard, an app that keeps everything that's due on one board.
Help the user plan, prioritise and break down their work. Be concise and concrete.
Format replies in Markdown, and use fenced code blocks with a language for any code.`;

/**
 * A reply that ends the turn with an error and no model call. The client's
 * `useAgentChat` shows it as `error.message`; the empty assistant message
 * isn't stored.
 */
const refuse = (errorText: string) =>
  createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => writer.write({ type: "error", errorText }),
    }),
  });

const textOf = (message: UIMessage | undefined) =>
  message?.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("") ?? "";

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
    if (!success) return refuse("Too many messages. Please wait a minute and try again.");

    const latest = this.messages.findLast((message) => message.role === "user");
    if (textOf(latest).length > MAX_CHAT_MESSAGE_LENGTH) {
      return refuse(`Messages can be up to ${MAX_CHAT_MESSAGE_LENGTH} characters.`);
    }

    // The AI quota (architecture.md §8): a reply turn is one message.
    // Checked before the model call; out of quota, the model isn't called
    // and the client shows its own limit notice for `AI_LIMIT_REACHED`.
    // Step 17's `TiboAgent` keeps this contract.
    const usage = usageClient(this.env.API);
    const { allowed } = await usage.check(this.name, AI_UNITS_PER_MESSAGE);
    if (!allowed) return refuse(AI_LIMIT_REACHED);

    // Recorded once the model has answered: when the reply finishes, or when
    // the user stops it after it started (the tokens were spent). A failed
    // call isn't charged.
    let started = false;
    let charged = false;
    const charge = async () => {
      if (charged) return;
      charged = true;
      await usage
        .record(this.name, AI_UNITS_PER_MESSAGE, "tibo_reply", options?.requestId ?? null)
        .catch((error: unknown) => console.error("Recording AI usage failed", error));
    };

    const result = streamText({
      model: museSpark(this.env, this.name),
      system: SYSTEM_PROMPT,
      // Drop old reasoning from the history so long chats stay cheap.
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        reasoning: "before-last-message",
      }),
      abortSignal: options?.abortSignal,
      onChunk: () => {
        started = true;
      },
      onFinish: charge,
      onAbort: () => (started ? charge() : undefined),
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

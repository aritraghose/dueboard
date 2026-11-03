import { MAX_REQUEST_BODY_BYTES } from "@dueboard/api/limits";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { env } from "./env.ts";

/**
 * The Worker's entry: TanStack Start's default handler, plus a same-origin
 * proxy for the chat agent (`api/src/agent.ts`). `useAgentChat` talks to
 * `/agents/chat-agent/<name>` over a WebSocket and plain HTTP; this forwards
 * both to the private `AGENT` service binding. It runs before Start, so the
 * WebSocket upgrade response reaches the browser untouched.
 *
 * Every request is limited per IP before any session lookup (architecture.md
 * §9): `/agents/*` by `AGENT_RATE_LIMIT`, Better Auth's routes by their own
 * `AUTH_RATE_LIMIT` (`routes/api/auth/$.ts`), and the rest (`/rpc`, pages,
 * server functions) by `WEB_RATE_LIMIT`. Request bodies are capped at
 * `MAX_REQUEST_BODY_BYTES`.
 */
export default createServerEntry({
  async fetch(request) {
    const { pathname } = new URL(request.url);
    // Cloudflare sets it on every incoming request, so clients can't spoof it.
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";

    if (pathname === "/agents" || pathname.startsWith("/agents/")) {
      const { success } = await env.AGENT_RATE_LIMIT.limit({ key: ip });
      if (!success) return tooManyRequests();
      return await proxyAgent(request);
    }

    if (pathname !== "/api/auth" && !pathname.startsWith("/api/auth/")) {
      const { success } = await env.WEB_RATE_LIMIT.limit({ key: ip });
      if (!success) return tooManyRequests();
    }

    const limited = await limitBody(request);
    if (limited instanceof Response) return limited;
    return await handler.fetch(limited);
  },
});

const tooManyRequests = () =>
  new Response("Too many requests. Please wait a minute and try again.", {
    status: 429,
    headers: { "retry-after": "60" },
  });

/**
 * The request with its body read into memory, or a 413 when it's over
 * `MAX_REQUEST_BODY_BYTES`. Reads the stream itself rather than trusting
 * `content-length`, which chunked requests don't send.
 */
async function limitBody(request: Request): Promise<Request | Response> {
  if (request.body === null) return request;
  const tooLarge = () => new Response("Request body too large.", { status: 413 });
  if (Number(request.headers.get("content-length")) > MAX_REQUEST_BODY_BYTES) return tooLarge();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_REQUEST_BODY_BYTES) {
      await reader.cancel();
      return tooLarge();
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(request, { body });
}

async function proxyAgent(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // Browsers send cookies on cross-site WebSocket handshakes, so only accept
  // requests from this site's own pages.
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== url.origin) {
    return new Response("Forbidden", { status: 403 });
  }

  const userId = await getOnboardedUserId(request);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  // `/agents/chat-agent/<name>/…`: only the chat agent, and only the signed-in
  // user's own instance, whatever name the browser asked for.
  const [, , agent, , ...rest] = url.pathname.split("/");
  if (agent !== "chat-agent") return new Response("Not found", { status: 404 });
  url.pathname = ["", "agents", agent, encodeURIComponent(userId), ...rest].join("/");

  return await env.AGENT.fetch(new Request(url, request));
}

/**
 * The signed-in user's id, if they finished onboarding. Same check as the
 * API's RPC middleware, through Better Auth's `get-session` over the `API`
 * service binding.
 */
async function getOnboardedUserId(request: Request): Promise<string | null> {
  const response = await env.API.fetch(
    new Request(new URL("/api/auth/get-session", request.url), {
      headers: { cookie: request.headers.get("cookie") ?? "" },
    }),
  );
  if (!response.ok) return null;
  const session = (await response.json()) as {
    user: { id: string; username?: string | null };
  } | null;
  return session?.user.username ? session.user.id : null;
}

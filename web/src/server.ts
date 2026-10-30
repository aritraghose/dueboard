import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { env } from "./env.ts";

/**
 * The Worker's entry: TanStack Start's default handler, plus a same-origin
 * proxy for the chat agent (`api/src/agent.ts`). `useAgentChat` talks to
 * `/agents/chat-agent/<name>` over a WebSocket and plain HTTP; this forwards
 * both to the private `AGENT` service binding. It runs before Start, so the
 * WebSocket upgrade response reaches the browser untouched.
 */
export default createServerEntry({
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/agents" || pathname.startsWith("/agents/")) {
      return await proxyAgent(request);
    }
    return await handler.fetch(request);
  },
});

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

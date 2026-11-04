import { MAX_REQUEST_BODY_BYTES } from "@dueboard/api/limits";
import { ASK_DOCUMENT_MAX_BYTES, ASK_DOCUMENT_MAX_LENGTH, ASK_DOCUMENT_NAME_MAX_LENGTH, documentText } from "@dueboard/api/rpc";
import {
  ASK_AGENT,
  ASK_DOCUMENT_CONVERT_PATH,
  ASK_QUESTION_PATH,
  ASK_THREAD_PATH,
  ASK_VISITOR_COOKIE,
  ASK_VISITOR_COOKIE_MAX_AGE_S,
  askInstanceName,
  askUsername,
  parseVisitorCookie,
  type AskConversion,
  type AskVisitor,
} from "@dueboard/api/ask";
import { TIBO_AGENT } from "@dueboard/api/tibo";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { env } from "./env.ts";

/**
 * The Worker's entry: TanStack Start's default handler, plus a same-origin
 * proxy for Tibo (`api/src/tibo/TiboAgent.ts`) and the public Ask page
 * (`api/src/ask/AskAgent.ts`). `TiboThread` talks to
 * `/agents/tibo-agent/<name>` over a WebSocket and the Ask page to
 * `/agents/ask-agent/<username>/…` over HTTP; this forwards both to the
 * private `AGENT` service binding. It runs before Start, so the
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

    // Files are bigger than every other body, so this has its own cap.
    if (pathname === ASK_DOCUMENT_CONVERT_PATH) return await convertAskDocument(request);

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
async function limitBody(request: Request, max = MAX_REQUEST_BODY_BYTES): Promise<Request | Response> {
  if (request.body === null) return request;
  const tooLarge = () => new Response("Request body too large.", { status: 413 });
  if (Number(request.headers.get("content-length")) > max) return tooLarge();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
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

  const [, , agent, name, ...rest] = url.pathname.split("/");
  if (agent === ASK_AGENT) return await proxyAsk(request, url, name ?? "", rest);

  const userId = await getOnboardedUserId(request);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  // `/agents/tibo-agent/<name>/…`: only Tibo, and only the signed-in user's
  // own instance, whatever name the browser asked for.
  if (agent !== TIBO_AGENT) return new Response("Not found", { status: 404 });
  url.pathname = ["", "agents", agent, encodeURIComponent(userId), ...rest].join("/");

  return await env.AGENT.fetch(new Request(url, request));
}

/**
 * `/agents/ask-agent/<username>/thread|ask`: the public Ask page
 * (architecture.md §7.6), with its own rules. No sign-in is needed. The
 * instance is computed here from the owner's username and the visitor
 * (their user id when signed in and onboarded, else a random id in an
 * HttpOnly cookie this sets), never taken from the browser. HTTP only, body
 * capped, and the visitor's cookies are not passed on: the agent learns who
 * is asking only from its name. The origin check and the per-IP limit
 * (`AGENT_RATE_LIMIT`) ran before this.
 */
async function proxyAsk(request: Request, url: URL, segment: string, rest: string[]): Promise<Response> {
  const notFound = () => new Response("Not found", { status: 404 });
  if (request.headers.get("upgrade") !== null) return notFound();
  const route = rest.join("/");
  const allowed =
    (route === ASK_THREAD_PATH && request.method === "GET") || (route === ASK_QUESTION_PATH && request.method === "POST");
  if (!allowed) return notFound();
  let username: string | null = null;
  try {
    username = askUsername(decodeURIComponent(segment));
  } catch {
    // A malformed escape: no such page.
  }
  if (!username) return notFound();

  const limited = await limitBody(request);
  if (limited instanceof Response) return limited;

  const userId = await getOnboardedUserId(request);
  const cookie = parseVisitorCookie(readCookie(request, ASK_VISITOR_COOKIE));
  const visitorId = userId ? null : (cookie ?? crypto.randomUUID());
  const visitor: AskVisitor = userId ? { kind: "user", id: userId } : { kind: "anon", id: visitorId! };

  url.pathname = ["", "agents", ASK_AGENT, encodeURIComponent(askInstanceName(username, visitor)), route].join("/");
  const headers = new Headers(limited.headers);
  headers.delete("cookie");
  headers.delete("authorization");
  const response = await env.AGENT.fetch(
    new Request(url, {
      method: limited.method,
      headers,
      body: limited.method === "POST" ? await limited.arrayBuffer() : null,
    }),
  );
  if (userId || cookie) return response;
  // A new logged-out visitor: name them for next time.
  const withCookie = new Response(response.body, response);
  withCookie.headers.append(
    "set-cookie",
    `${ASK_VISITOR_COOKIE}=${visitorId}; Path=/; Max-Age=${ASK_VISITOR_COOKIE_MAX_AGE_S}; HttpOnly; Secure; SameSite=Lax`,
  );
  return withCookie;
}

/**
 * `POST /api/ask-documents/convert`: a PDF for the signed-in user's Ask page
 * (Settings → Ask page), turned into text with Workers AI's `toMarkdown`
 * (embedded images skipped, no metadata). Nothing is stored here: the
 * owner reviews the text and saves it with the `AddAskDocument` RPC. Same
 * origin only, onboarded users only, `ASK_DOCUMENT_RATE_LIMIT` per user,
 * at most `ASK_DOCUMENT_MAX_BYTES`, and only real PDFs (`%PDF-`).
 */
async function convertAskDocument(request: Request): Promise<Response> {
  const answer = (body: AskConversion, status = 200) => Response.json(body, { status });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  const userId = await getOnboardedUserId(request);
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const { success } = await env.ASK_DOCUMENT_RATE_LIMIT.limit({ key: userId });
  if (!success) return answer({ ok: false, error: "limited" }, 429);

  const limited = await limitBody(request, ASK_DOCUMENT_MAX_BYTES);
  if (limited instanceof Response) return answer({ ok: false, error: "too_large" }, 413);
  const bytes = new Uint8Array(await limited.arrayBuffer());
  const isPdf = bytes.length > 5 && new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
  if (!isPdf) return answer({ ok: false, error: "not_pdf" }, 415);

  const name = fileName(request.headers.get("x-file-name"));
  try {
    const result = await env.AI.toMarkdown(
      { name, blob: new Blob([bytes], { type: "application/pdf" }) },
      { conversionOptions: { pdf: { metadata: false, images: { convert: false } } } },
    );
    if (result.format === "error") {
      console.error("Ask document conversion failed", result.error);
      return answer({ ok: false, error: "failed" }, 422);
    }
    const { text, truncated } = documentText(result.data, ASK_DOCUMENT_MAX_LENGTH);
    if (text.length === 0) return answer({ ok: false, error: "empty" }, 422);
    return answer({ ok: true, name, text, truncated });
  } catch (error) {
    console.error("Ask document conversion failed", error);
    return answer({ ok: false, error: "failed" }, 502);
  }
}

/** The file's name as the browser sent it (URI-encoded), tidied, or a plain default. */
function fileName(header: string | null): string {
  let name = "";
  try {
    name = decodeURIComponent(header ?? "");
  } catch {
    // A malformed escape: use the default.
  }
  name = name.replace(/[\u0000-\u001F\u007F/\\]/g, "").trim().slice(0, ASK_DOCUMENT_NAME_MAX_LENGTH).trim();
  return name || "Document.pdf";
}

/** One cookie's value from the request, or `null`. */
function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
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

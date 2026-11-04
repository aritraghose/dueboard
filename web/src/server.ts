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
import { TIBO_AGENT, TIBO_FILES_PATH, TIBO_FILE_MAX_BYTES } from "@dueboard/api/tibo";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { env } from "./env.ts";

export default createServerEntry({
  async fetch(request) {
    const { pathname } = new URL(request.url);
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";

    if (pathname === "/agents" || pathname.startsWith("/agents/")) {
      const fileRead = request.method === "GET" && isTiboFilePath(pathname);
      const { success } = await (fileRead ? env.WEB_RATE_LIMIT : env.AGENT_RATE_LIMIT).limit({ key: ip });
      if (!success) return tooManyRequests();
      return await proxyAgent(request);
    }

    if (pathname !== "/api/auth" && !pathname.startsWith("/api/auth/")) {
      const { success } = await env.WEB_RATE_LIMIT.limit({ key: ip });
      if (!success) return tooManyRequests();
      if (!SAFE_METHODS.has(request.method) && !sameOrigin(request)) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    if (pathname === ASK_DOCUMENT_CONVERT_PATH) return await convertAskDocument(request);

    const limited = await limitBody(request);
    if (limited instanceof Response) return limited;
    return await handler.fetch(limited);
  },
});

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const isTiboFilePath = (pathname: string) => {
  const [, , agent, , route, id, ...more] = pathname.split("/");
  return agent === TIBO_AGENT && route === TIBO_FILES_PATH && id !== undefined && id !== "" && more.length === 0;
};

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin !== null) return origin === new URL(request.url).origin;
  const site = request.headers.get("sec-fetch-site");
  return site === null || site === "same-origin" || site === "none";
}

const tooManyRequests = () =>
  new Response("Too many requests. Please wait a minute and try again.", {
    status: 429,
    headers: { "retry-after": "60" },
  });

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

  if (!sameOrigin(request)) return new Response("Forbidden", { status: 403 });

  const [, , agent, name, ...rest] = url.pathname.split("/");
  if (agent === ASK_AGENT) return await proxyAsk(request, url, name ?? "", rest);

  const userId = await getOnboardedUserId(request);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  if (agent !== TIBO_AGENT) return new Response("Not found", { status: 404 });
  url.pathname = ["", "agents", agent, encodeURIComponent(userId), ...rest].join("/");

  if (request.headers.get("upgrade") !== null) return await env.AGENT.fetch(new Request(url, request));

  const headers = new Headers(request.headers);
  headers.delete("cookie");
  headers.delete("authorization");

  const upload = request.method === "POST" && rest.length === 1 && rest[0] === TIBO_FILES_PATH;
  if (upload) {
    if (request.headers.get("origin") !== url.origin) return new Response("Forbidden", { status: 403 });
    const { success } = await env.TIBO_FILE_RATE_LIMIT.limit({ key: userId });
    if (!success) return Response.json({ ok: false, error: "limited" }, { status: 429 });
  }
  const limited = await limitBody(request, upload ? TIBO_FILE_MAX_BYTES : MAX_REQUEST_BODY_BYTES);
  if (limited instanceof Response) {
    return upload ? Response.json({ ok: false, error: "too_large" }, { status: 413 }) : limited;
  }
  const hasBody = limited.method !== "GET" && limited.method !== "HEAD";
  return await env.AGENT.fetch(
    new Request(url, { method: limited.method, headers, body: hasBody ? await limited.arrayBuffer() : null }),
  );
}

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
  const withCookie = new Response(response.body, response);
  withCookie.headers.append(
    "set-cookie",
    `${ASK_VISITOR_COOKIE}=${visitorId}; Path=/; Max-Age=${ASK_VISITOR_COOKIE_MAX_AGE_S}; HttpOnly; Secure; SameSite=Lax`,
  );
  return withCookie;
}

async function convertAskDocument(request: Request): Promise<Response> {
  const answer = (body: AskConversion, status = 200) => Response.json(body, { status });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
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

function fileName(header: string | null): string {
  let name = "";
  try {
    name = decodeURIComponent(header ?? "");
  } catch {
  }
  name = name.replace(/[\u0000-\u001F\u007F/\\]/g, "").trim().slice(0, ASK_DOCUMENT_NAME_MAX_LENGTH).trim();
  return name || "Document.pdf";
}

function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

async function getOnboardedUserId(request: Request): Promise<string | null> {
  const url = new URL("/api/auth/get-session", request.url);
  url.searchParams.set("disableCookieCache", "true");
  const response = await env.API.fetch(
    new Request(url, {
      headers: { cookie: request.headers.get("cookie") ?? "" },
    }),
  );
  if (!response.ok) return null;
  const session = (await response.json()) as {
    user: { id: string; username?: string | null };
  } | null;
  return session?.user.username ? session.user.id : null;
}

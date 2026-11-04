export const ASK_AGENT = "ask-agent";

export const ASK_THREAD_PATH = "thread";
export const ASK_QUESTION_PATH = "ask";

export const ASK_VISITOR_COOKIE = "__Host-dueboard-ask";
export const ASK_VISITOR_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;

export const ASK_DOCUMENT_CONVERT_PATH = "/api/ask-documents/convert";

export type AskConversion =
  | { readonly ok: true; readonly name: string; readonly text: string; readonly truncated: boolean }
  | { readonly ok: false; readonly error: "not_pdf" | "too_large" | "empty" | "failed" | "limited" };

export const ASK_TURNSTILE_ACTION = "ask";

export interface AskExchange {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
  readonly createdAt: number;
}

export interface AskThread {
  readonly exchanges: readonly AskExchange[];
  readonly needsVerification: boolean;
  readonly siteKey: string;
}

export interface AskRequest {
  readonly question: string;
  readonly token?: string;
}

export type AskRefusal = "off" | "unavailable" | "quota" | "limited" | "verify" | "invalid" | "busy";

export type AskResponse =
  | { readonly ok: true; readonly exchange: AskExchange }
  | {
      readonly ok: false;
      readonly error: AskRefusal;
      readonly needsVerification: boolean;
    };

export type AskVisitor = { readonly kind: "user"; readonly id: string } | { readonly kind: "anon"; readonly id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;
const USERNAME = /^[a-z0-9_.]{3,30}$/;

export const parseVisitorCookie = (value: string | null | undefined): string | null =>
  value && UUID.test(value) ? value : null;

export const askUsername = (segment: string): string | null => {
  const value = segment.trim().replace(/^@/, "").toLowerCase();
  return USERNAME.test(value) ? value : null;
};

export const askInstanceName = (username: string, visitor: AskVisitor): string =>
  `${username}~${visitor.kind === "user" ? "u" : "v"}.${visitor.id}`;

export const parseAskInstanceName = (
  name: string,
): { readonly username: string; readonly visitor: AskVisitor } | null => {
  const match = /^([a-z0-9_.]{3,30})~([uv])\.(.+)$/.exec(name);
  if (!match) return null;
  const [, username, kind, id] = match as unknown as [string, string, "u" | "v", string];
  if (kind === "u") return USER_ID.test(id) ? { username, visitor: { kind: "user", id } } : null;
  return UUID.test(id) ? { username, visitor: { kind: "anon", id } } : null;
};

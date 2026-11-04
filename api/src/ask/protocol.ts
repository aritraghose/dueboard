// The Ask page's HTTP protocol (architecture.md §7.6): what the browser's
// `/@username/ask` page and the `AskAgent` Durable Object send each other
// through the website's `/agents/ask-agent/…` proxy, plus the instance
// name the proxy computes. Plain types and functions with no imports, so
// the browser and the website's Worker can use them (`@dueboard/api/ask`).

/** The agent's path segment (`/agents/ask-agent/…`), the kebab-case of its binding `AskAgent`. */
export const ASK_AGENT = "ask-agent";

/** `GET …/thread`: this visitor's exchange with the owner's page. */
export const ASK_THREAD_PATH = "thread";
/** `POST …/ask` with an `AskRequest`: one question. */
export const ASK_QUESTION_PATH = "ask";

/** The HttpOnly cookie that names a logged-out visitor (a random UUID). */
export const ASK_VISITOR_COOKIE = "__Host-dueboard-ask";
/** How long the visitor cookie lasts. Their exchange itself is wiped after an hour idle. */
export const ASK_VISITOR_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;

/**
 * `POST` a PDF (the raw bytes, `content-type: application/pdf`, the file
 * name in `x-file-name`) to turn it into the text an Ask page keeps. The
 * website answers `AskConversion`; nothing is stored until the owner saves
 * the (reviewed) text with the `AddAskDocument` RPC.
 */
export const ASK_DOCUMENT_CONVERT_PATH = "/api/ask-documents/convert";

/** What the convert route answers. */
export type AskConversion =
  | { readonly ok: true; readonly name: string; readonly text: string; readonly truncated: boolean }
  | { readonly ok: false; readonly error: "not_pdf" | "too_large" | "empty" | "failed" | "limited" };

/** The Turnstile action the page renders and the agent requires. */
export const ASK_TURNSTILE_ACTION = "ask";

/** One question and its answer. */
export interface AskExchange {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
  /** Milliseconds since the epoch. */
  readonly createdAt: number;
}

/** `GET …/thread`'s answer. */
export interface AskThread {
  readonly exchanges: readonly AskExchange[];
  /** The next question needs a Turnstile token (the first of a visitor session). */
  readonly needsVerification: boolean;
  /** Turnstile's public sitekey, for rendering the widget. */
  readonly siteKey: string;
}

/** `POST …/ask`'s body. */
export interface AskRequest {
  readonly question: string;
  /** A fresh Turnstile token, when `needsVerification`. */
  readonly token?: string;
}

/**
 * Why a question got no answer. The page shows a fixed line for each and
 * never more detail:
 * - `off`: the page is off (or a block); "not available".
 * - `unavailable`: the owner's Ask pool for logged-out visitors ran out, or
 *   the model failed; "unavailable right now".
 * - `quota`: a signed-in visitor used their own AI requests this month.
 * - `limited`: this visitor asked a lot; "try again later".
 * - `verify`: Turnstile is needed, or the token failed; the page shows the widget.
 * - `invalid`: an empty or too-long question.
 * - `busy`: another question from this visitor is still being answered.
 */
export type AskRefusal = "off" | "unavailable" | "quota" | "limited" | "verify" | "invalid" | "busy";

/** `POST …/ask`'s answer. */
export type AskResponse =
  | { readonly ok: true; readonly exchange: AskExchange }
  | {
      readonly ok: false;
      readonly error: AskRefusal;
      /** Whether the next question still needs a Turnstile token (a check can pass even when the question is refused later). */
      readonly needsVerification: boolean;
    };

/** Who is asking: a signed-in user (`u.<user id>`) or a logged-out visitor (`v.<cookie uuid>`). */
export type AskVisitor = { readonly kind: "user"; readonly id: string } | { readonly kind: "anon"; readonly id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** Better Auth ids: letters, digits, `_` and `-`. */
const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** Usernames as stored: lowercase letters, digits, `_` and `.`, 3–30 (`domain/social-rules.ts`). */
const USERNAME = /^[a-z0-9_.]{3,30}$/;

/** A visitor cookie value we issued, or `null`. */
export const parseVisitorCookie = (value: string | null | undefined): string | null =>
  value && UUID.test(value) ? value : null;

/** The username from a URL segment (`@` and case don't matter), or `null`. */
export const askUsername = (segment: string): string | null => {
  const value = segment.trim().replace(/^@/, "").toLowerCase();
  return USERNAME.test(value) ? value : null;
};

/**
 * The `AskAgent` instance for one owner and one visitor:
 * `<username>~<u|v>.<id>`. Computed by the website's proxy from the URL's
 * username and the visitor's session or cookie, never taken from the client.
 * `~` is URL-safe and appears in neither usernames nor ids.
 */
export const askInstanceName = (username: string, visitor: AskVisitor): string =>
  `${username}~${visitor.kind === "user" ? "u" : "v"}.${visitor.id}`;

/** The owner and visitor an instance name stands for, or `null` for a name the proxy wouldn't make. */
export const parseAskInstanceName = (
  name: string,
): { readonly username: string; readonly visitor: AskVisitor } | null => {
  const match = /^([a-z0-9_.]{3,30})~([uv])\.(.+)$/.exec(name);
  if (!match) return null;
  const [, username, kind, id] = match as unknown as [string, string, "u" | "v", string];
  if (kind === "u") return USER_ID.test(id) ? { username, visitor: { kind: "user", id } } : null;
  return UUID.test(id) ? { username, visitor: { kind: "anon", id } } : null;
};

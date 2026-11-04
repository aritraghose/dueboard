// Server-side Turnstile verification for the Ask page (Siteverify), as
// Cloudflare documents it: the token is checked here, never in the browser,
// and passes only when `success` is true, the action is the page's and the
// hostname is the site's. Fails closed on any network or format error.
// Tokens are single-use, so the page resets its widget after each try.

import { ASK_TURNSTILE_ACTION } from "./protocol.ts";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Cloudflare's published test keys, used under `alchemy dev` so no real
 * widget is needed locally: this sitekey always passes and renders a
 * visible widget, and the secret accepts its dummy token.
 * https://developers.cloudflare.com/turnstile/troubleshooting/testing/
 */
export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
export const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";

export interface TurnstileCheck {
  readonly secret: string;
  readonly token: unknown;
  /** The visitor's IP (`cf-connecting-ip`), sent as `remoteip`. */
  readonly remoteIp: string | null;
  /**
   * Hostnames the token must come from. Empty only under `alchemy dev`,
   * where the test keys report a placeholder hostname.
   */
  readonly hostnames: readonly string[];
  readonly fetch?: typeof fetch;
}

/** Whether the token is a fresh, valid Turnstile token for the Ask page on this site. */
export async function verifyTurnstile({ secret, token, remoteIp, hostnames, fetch: send = fetch }: TurnstileCheck) {
  if (typeof token !== "string" || token.length === 0 || token.length > 2048 || secret.length === 0) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);
  let result: { success?: unknown; action?: unknown; hostname?: unknown };
  try {
    const response = await send(SITEVERIFY, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return false;
    result = (await response.json()) as typeof result;
  } catch {
    return false;
  }
  if (result.success !== true) return false;
  if (hostnames.length === 0) return true;
  return result.action === ASK_TURNSTILE_ACTION && typeof result.hostname === "string" && hostnames.includes(result.hostname);
}

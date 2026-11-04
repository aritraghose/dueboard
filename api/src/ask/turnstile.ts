import { ASK_TURNSTILE_ACTION } from "./protocol.ts";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
export const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";

export interface TurnstileCheck {
  readonly secret: string;
  readonly token: unknown;
  readonly remoteIp: string | null;
  readonly hostnames: readonly string[];
  readonly fetch?: typeof fetch;
}

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

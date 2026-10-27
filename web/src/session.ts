import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { env } from "./env.ts";

export interface SessionUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly image: string | null;
  /** `null` until the user finishes `/onboarding`. */
  readonly username: string | null;
}

/**
 * The signed-in user, or `null`. A server function, so route guards
 * (`beforeLoad`) read the same session during SSR and client navigation:
 * it forwards the request's cookies to Better Auth's `get-session` endpoint
 * over the `API` service binding.
 */
export const getSessionUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionUser | null> => {
    const request = getRequest();
    const response = await env.API.fetch(
      new Request(new URL("/api/auth/get-session", request.url), {
        headers: { cookie: request.headers.get("cookie") ?? "" },
      }),
    );
    if (!response.ok) throw new Error(`get-session returned ${response.status}`);

    // Better Auth renews the session cookie (or clears an invalid one) on
    // get-session. Forward it, or the cookie expires 7 days after sign-in.
    const cookies = response.headers.getSetCookie();
    if (cookies.length > 0) setResponseHeader("set-cookie", cookies);

    const session = (await response.json()) as { user: SessionUser } | null;
    if (!session) return null;
    const { id, name, email, image, username } = session.user;
    return { id, name, email, image: image ?? null, username: username ?? null };
  },
);

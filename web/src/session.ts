import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { env } from "./env.ts";

export interface SessionUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly image: string | null;
  readonly username: string | null;
}

export const getSessionUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionUser | null> => {
    const request = getRequest();
    const response = await env.API.fetch(
      new Request(new URL("/api/auth/get-session", request.url), {
        headers: { cookie: request.headers.get("cookie") ?? "" },
      }),
    );
    if (!response.ok) throw new Error(`get-session returned ${response.status}`);

    const cookies = response.headers.getSetCookie();
    if (cookies.length > 0) setResponseHeader("set-cookie", cookies);

    const session = (await response.json()) as { user: SessionUser } | null;
    if (!session) return null;
    const { id, name, email, image, username } = session.user;
    return { id, name, email, image: image ?? null, username: username ?? null };
  },
);

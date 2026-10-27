import { createFileRoute } from "@tanstack/react-router";
import { env } from "../../../env.ts";

/**
 * Same-origin proxy for Better Auth, which runs in the private `ApiWorker`
 * (`api/src/auth.ts`). Like `/rpc`, it forwards the browser's request
 * unchanged over the `API` service binding, so Better Auth sees this site's
 * origin: its cookies, redirects and the Google callback
 * (`/api/auth/callback/google`) all live on the website's domain.
 *
 * Each client IP gets a budget (`AUTH_RATE_LIMIT` in `alchemy.run.ts`).
 * Cloudflare sets `cf-connecting-ip` on every incoming request, so clients
 * can't spoof it. Route guards read the session through `getSessionUser`,
 * which calls the API directly, so they don't spend this budget.
 */
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const key = request.headers.get("cf-connecting-ip") ?? "unknown";
        const { success } = await env.AUTH_RATE_LIMIT.limit({ key });
        if (!success) {
          // The same `{ code, message }` shape as Better Auth's errors, so
          // the auth client shows the message.
          return Response.json(
            {
              code: "TOO_MANY_REQUESTS",
              message: "Too many requests. Please wait a minute and try again.",
            },
            { status: 429, headers: { "retry-after": "60" } },
          );
        }
        return await env.API.fetch(request);
      },
    },
  },
});

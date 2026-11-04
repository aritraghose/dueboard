import { createFileRoute } from "@tanstack/react-router";
import { env } from "../../../env.ts";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const key = request.headers.get("cf-connecting-ip") ?? "unknown";
        const { success } = await env.AUTH_RATE_LIMIT.limit({ key });
        if (!success) {
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

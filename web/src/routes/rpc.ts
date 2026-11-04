import { createFileRoute } from "@tanstack/react-router";
import { env } from "../env.ts";

export const Route = createFileRoute("/rpc")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        return await env.API.fetch(request);
      },
    },
  },
});

/// <reference types="@cloudflare/workers-types" />

import { getAgentByName, routeAgentRequest } from "agents";
import type { AgentEnv } from "./AgentWorker.ts";
import { tiboClient } from "./domain-client.ts";
import { TiboAgent } from "./tibo/TiboAgent.ts";

export { TiboAgent };

/**
 * Wipes the Tibo threads of deleted accounts (`domain/tibo.ts`). Each wipe
 * is cleared only once its agent confirmed, so a failure retries on the
 * next run, and wiping an already empty agent is harmless.
 */
async function wipeDeletedThreads(env: AgentEnv) {
  const tibo = tiboClient(env.DOMAIN);
  const { userIds } = await tibo.pendingWipes();
  const done: string[] = [];
  for (const userId of userIds) {
    try {
      const agent = await getAgentByName(env.TiboAgent as DurableObjectNamespace<TiboAgent>, userId);
      await agent.wipe();
      done.push(userId);
    } catch (error) {
      console.error("Wiping a Tibo thread failed", userId, error);
    }
  }
  if (done.length > 0) await tibo.wipesDone(done);
}

export default {
  async fetch(request: Request, env: AgentEnv) {
    // `/agents/tibo-agent/<user id>/…`, rewritten by the web stack's proxy.
    return (await routeAgentRequest(request, env)) ?? new Response("Not found", { status: 404 });
  },
  async scheduled(_controller: ScheduledController, env: AgentEnv, ctx: ExecutionContext) {
    ctx.waitUntil(wipeDeletedThreads(env));
  },
};

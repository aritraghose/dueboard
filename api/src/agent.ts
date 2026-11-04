/// <reference types="@cloudflare/workers-types" />

import { getAgentByName, routeAgentRequest } from "agents";
import type { AgentEnv } from "./AgentWorker.ts";
import { askEnv } from "./ask-env.ts";
import { AskAgentBase } from "./ask/AskAgent.ts";
import { tiboClient, type TiboEventJson } from "./domain-client.ts";
import { TiboAgent } from "./tibo/TiboAgent.ts";

export { TiboAgent };

export class AskAgent extends AskAgentBase {
  constructor(ctx: DurableObjectState, env: AgentEnv) {
    super(ctx, askEnv(env));
  }
}

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

async function deliverTiboEvents(env: AgentEnv) {
  const tibo = tiboClient(env.DOMAIN);
  const { events } = await tibo.pendingEvents();
  if (events.length === 0) return;
  const byUser = new Map<string, TiboEventJson[]>();
  for (const event of events) byUser.set(event.userId, [...(byUser.get(event.userId) ?? []), event]);
  const done: string[] = [];
  await Promise.all(
    [...byUser].map(async ([userId, userEvents]) => {
      try {
        const agent = await getAgentByName(env.TiboAgent as DurableObjectNamespace<TiboAgent>, userId);
        await agent.deliverEvents(userEvents);
        done.push(...userEvents.map((event) => event.id));
      } catch (error) {
        console.error("Delivering Tibo events failed", userId, error);
      }
    }),
  );
  if (done.length > 0) await tibo.eventsDone(done);
}

async function syncRelays(env: AgentEnv) {
  const { relays } = await env.DOMAIN.relaySweep();
  const agent = (userId: string) => getAgentByName(env.TiboAgent as DurableObjectNamespace<TiboAgent>, userId);
  await Promise.all(
    relays.flatMap((relay) => [
      ...(relay.recipientSynced ? [] : [relay.toUserId]),
      ...(relay.senderSynced ? [] : [relay.fromUserId]),
    ].map(async (userId) => {
      try {
        await (await agent(userId)).relaySync(relay.id);
      } catch (error) {
        console.error("Syncing a relay failed", relay.id, userId, error);
      }
    })),
  );
}

export default {
  async fetch(request: Request, env: AgentEnv) {
    return (await routeAgentRequest(request, env)) ?? new Response("Not found", { status: 404 });
  },
  async scheduled(controller: ScheduledController, env: AgentEnv, ctx: ExecutionContext) {
    ctx.waitUntil(deliverTiboEvents(env).catch((error: unknown) => console.error("Tibo event delivery failed", error)));
    ctx.waitUntil(syncRelays(env).catch((error: unknown) => console.error("Relay sync failed", error)));
    if (new Date(controller.scheduledTime).getUTCMinutes() % 5 === 0) ctx.waitUntil(wipeDeletedThreads(env));
  },
};

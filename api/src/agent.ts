/// <reference types="@cloudflare/workers-types" />

import { getAgentByName, routeAgentRequest } from "agents";
import type { AgentEnv } from "./AgentWorker.ts";
import { askEnv } from "./ask-env.ts";
import { AskAgentBase } from "./ask/AskAgent.ts";
import { tiboClient, type TiboEventJson } from "./domain-client.ts";
import { TiboAgent } from "./tibo/TiboAgent.ts";

export { TiboAgent };

/**
 * `/agents/ask-agent/<owner>~<visitor>`: one visitor's exchange with one
 * owner's Ask page (`./ask/AskAgent.ts`). The runtime constructs it with the
 * Worker's full env; this narrows it to `AskEnv` before the agent sees it.
 */
export class AskAgent extends AskAgentBase {
  constructor(ctx: DurableObjectState, env: AgentEnv) {
    super(ctx, askEnv(env));
  }
}

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

/**
 * Delivers the domain's events (`domain/tibo.ts`'s outbox) to each user's
 * agent, oldest first, and clears what was delivered. A failed delivery
 * stays queued for the next run; the outbox drops anything a day old.
 */
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

/**
 * Relays an agent hasn't heard about yet (`domain/relays.ts`): the sweep
 * first expires old ones, then hands out those still owed to a side, and
 * each side's agent reads the relay itself and catches up (`relaySync`).
 * Normally the agents reach each other directly; this is the fallback, and
 * how expiries and held deliveries get through.
 */
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
    // `/agents/tibo-agent/<user id>/…` and `/agents/ask-agent/<owner>~<visitor>/…`,
    // both named by the web stack's proxy.
    return (await routeAgentRequest(request, env)) ?? new Response("Not found", { status: 404 });
  },
  async scheduled(controller: ScheduledController, env: AgentEnv, ctx: ExecutionContext) {
    ctx.waitUntil(deliverTiboEvents(env).catch((error: unknown) => console.error("Tibo event delivery failed", error)));
    ctx.waitUntil(syncRelays(env).catch((error: unknown) => console.error("Relay sync failed", error)));
    // Wipes keep their old pace.
    if (new Date(controller.scheduledTime).getUTCMinutes() % 5 === 0) ctx.waitUntil(wipeDeletedThreads(env));
  },
};

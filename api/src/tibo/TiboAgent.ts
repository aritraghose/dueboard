/// <reference types="@cloudflare/workers-types" />

import { Agent, type Connection, type ConnectionContext, type WSMessage } from "agents";
import { streamText } from "ai";
import type { AgentEnv } from "../AgentWorker.ts";
import { AI_UNITS_PER_MESSAGE } from "../domain/usage-constants.ts";
import { tiboClient, usageClient } from "../internal-client.ts";
import { MAX_CHAT_MESSAGE_LENGTH } from "../limits.ts";
import { BubbleSplitter, reactionLine, reactionOf, typingDelayMs } from "./bubbles.ts";
import { RECENT_WINDOW, buildTurnContext, type TurnContext } from "./context.ts";
import { MODEL, museSpark } from "./model.ts";
import { PERSONA } from "./persona.ts";
import {
  TIBO_HISTORY_PAGE,
  TIBO_MAX_BUBBLES,
  TIBO_OLDER_PAGE,
  type TiboClientFrame,
  type TiboServerFrame,
} from "./protocol.ts";
import { Thread } from "./thread.ts";

/** Lines Tibo "says" when something breaks. Shown once, never stored or charged. */
const ERROR_BUBBLES = {
  model: "Okay, my brain just blue-screened. Nothing got sent, nothing got charged. Try me again in a sec?",
  rateLimit: "Whoa, you're typing faster than I can think, and I think FAST. Give me a minute, then hit me again.",
} as const;

/** The longest a browser-made `clientId` may be. */
const MAX_CLIENT_ID_LENGTH = 64;

/**
 * Tibo: one Durable Object per user, named by their user id (the web
 * stack's `/agents/*` proxy pins the name to the session's user, whatever the
 * browser asks for). It holds the user's single, never-ending thread in its
 * SQLite (`./thread.ts`) and talks to every open tab over WebSockets with
 * the frames in `./protocol.ts`, broadcasting so the side panel, `/inbox`
 * and other devices stay in sync.
 *
 * It extends the base `Agent`, not `AIChatAgent`: that one keeps the whole
 * history in memory and sends all of it to the model every turn, and this
 * thread lasts for years. Each turn's context is built fresh
 * (`./context.ts`) from the persona and the latest messages.
 */
export class TiboAgent extends Agent<AgentEnv> {
  private threadStore: Thread | undefined;
  /** A turn is running; others wait for it. In memory: a restart drops it with the turn. */
  private running = false;
  /** A message arrived during the running turn, so another follows it. */
  private owed = false;

  private get thread() {
    if (!this.threadStore) {
      this.threadStore = new Thread(this.ctx.storage.sql);
      this.threadStore.migrate();
    }
    return this.threadStore;
  }

  onStart() {
    void this.thread;
  }

  /** The thread lives in SQL, not in Agent state; browsers may not write state. */
  validateStateChange(_next: unknown, source: Connection | "server") {
    if (source !== "server") throw new Error("Read-only");
  }

  onConnect(connection: Connection, _ctx: ConnectionContext) {
    const { messages, hasMore } = this.thread.latest(TIBO_HISTORY_PAGE);
    this.sendTo(connection, { type: "history", messages, hasMore });
  }

  onMessage(connection: Connection, raw: WSMessage) {
    const frame = parseFrame(raw);
    if (!frame) return;

    if (frame.type === "loadOlder") {
      const { messages, hasMore } = this.thread.before(frame.beforeId, TIBO_OLDER_PAGE);
      this.sendTo(connection, { type: "older", messages, hasMore });
      return;
    }

    if (frame.type === "react") {
      // Only on Tibo's messages, and only for the UI: the model never sees these.
      if (frame.emoji !== null && reactionOf(reactionLine(frame.emoji)) === null) return;
      const message = this.thread.react(frame.messageId, "tibo", frame.emoji);
      if (message) this.send({ type: "reaction", messageId: message.id, emoji: frame.emoji });
      return;
    }

    const text = frame.text.trim();
    if (!text) return;
    if (text.length > MAX_CHAT_MESSAGE_LENGTH) {
      this.sendTo(connection, {
        type: "error",
        message: `Messages can be up to ${MAX_CHAT_MESSAGE_LENGTH} characters.`,
      });
      return;
    }
    // 1. Save the user's message, and show it in every tab. A reply's quote
    // is built here from the stored message, never taken from the browser.
    const replyTo = frame.replyTo ? this.thread.quote(frame.replyTo) : null;
    const message = this.thread.add({
      role: "user",
      body: text,
      meta: { clientId: frame.clientId, ...(replyTo ? { replyTo } : {}) },
    });
    this.send({ type: "bubble", message });
    this.requestTurn();
  }

  /**
   * Account deletion (`domain/tibo.ts`): drops the thread and everything
   * else this agent stored. Called over RPC by the AgentWorker's wipe cron.
   */
  async wipe() {
    for (const connection of this.getConnections()) connection.close(4000, "Account deleted");
    await this.destroy();
  }

  // ─── Turns ───────────────────────────────────────────────────────────────

  /**
   * Runs a turn, or marks one owed if a turn is already running: messages
   * sent mid-reply wait, then get one reply together, so two turns never
   * overlap.
   */
  private requestTurn() {
    if (this.running) {
      this.owed = true;
      return;
    }
    this.running = true;
    // Kept alive (and off hibernation) until the queue drains.
    void this.keepAliveWhile(async () => {
      try {
        do {
          this.owed = false;
          await this.turn();
        } while (this.owed && this.thread.awaitingReply());
      } finally {
        this.running = false;
      }
    });
  }

  private async turn() {
    const turnId = crypto.randomUUID();
    const userId = this.name;
    const usage = usageClient(this.env.API);
    try {
      // 2. The per-user chat rate limit, then the monthly quota. Out of
      // either, no model call.
      const { success } = await this.env.CHAT_RATE_LIMIT.limit({ key: userId });
      if (!success) {
        this.send({
          type: "error",
          message: "Too many messages. Please wait a minute and try again.",
          bubble: ERROR_BUBBLES.rateLimit,
        });
        return;
      }
      const [{ allowed, usage: current }, profile] = await Promise.all([
        usage.check(userId, AI_UNITS_PER_MESSAGE),
        tiboClient(this.env.API).profile(userId),
      ]);
      if (!allowed) {
        this.send({ type: "limitReached", limit: current.limit });
        this.send({ type: "usage", remaining: current.remaining, limit: current.limit });
        return;
      }

      // Tibo has read everything so far: double ticks.
      const seen = this.thread.markSeen();
      if (seen.length > 0) this.send({ type: "seen", messageIds: seen });

      // 3. The context, built fresh.
      const recent = this.thread.latest(RECENT_WINDOW).messages;
      const context = buildTurnContext({ persona: PERSONA, profile, now: new Date(), recent });
      // Tibo may react to the newest thing the user said.
      const latestUserMessage = recent.findLast((message) => message.role === "user");

      // 4–6. Stream the reply, and deliver it bubble by bubble.
      const answered = await this.reply(turnId, context, latestUserMessage?.id ?? null);

      // 7. One message of usage for the turn, however many bubbles. A reply
      // that failed before its first bubble (or reaction) isn't charged.
      if (answered) {
        const after = await usage
          .record(userId, AI_UNITS_PER_MESSAGE, "tibo_reply", turnId)
          .catch((error: unknown) => {
            console.error("Recording AI usage failed", error);
            return null;
          });
        if (after) this.send({ type: "usage", remaining: after.remaining, limit: after.limit });
      }
    } catch (error) {
      console.error("Tibo turn failed", error);
      this.send({ type: "typing", on: false });
      this.send({ type: "error", message: "Tibo couldn't reply.", bubble: ERROR_BUBBLES.model });
    } finally {
      this.send({ type: "turnDone", turnId });
    }
  }

  /**
   * Streams the model's reply and shows each bubble after a typing pause
   * based on its length. The model keeps writing while a bubble "types",
   * so the pause and the model's latency overlap. A reaction line (the
   * model's choice, `./bubbles.ts`) is applied to `reactTo` as soon as it
   * streams in. Returns whether anything was shown (a bubble or a
   * reaction); throws if the model failed before that.
   */
  private async reply(turnId: string, context: TurnContext, reactTo: string | null): Promise<boolean> {
    const bubbles = new Channel<string>();
    const splitter = new BubbleSplitter(TIBO_MAX_BUBBLES);
    let reacted = false;
    const takeReaction = () => {
      const emoji = splitter.takeReaction();
      if (!emoji || !reactTo) return;
      const message = this.thread.react(reactTo, "user", emoji);
      if (!message) return;
      reacted = true;
      this.send({ type: "reaction", messageId: message.id, emoji });
    };

    // Steps 18 and 19 add `tools` (and a step limit) here.
    const result = streamText({
      model: museSpark(this.env, this.name),
      system: context.system,
      messages: context.messages,
    });
    const produce = (async () => {
      for await (const part of result.fullStream) {
        if (part.type === "error") throw part.error;
        if (part.type === "text-delta") {
          for (const bubble of splitter.push(part.text)) bubbles.put(bubble);
          takeReaction();
        }
      }
      for (const bubble of splitter.finish()) bubbles.put(bubble);
      takeReaction();
    })().then(
      () => bubbles.close(),
      (error: unknown) => bubbles.close(error),
    );

    let delivered = 0;
    let typingSince = Date.now();
    this.send({ type: "typing", on: true });
    try {
      for (;;) {
        const next = await bubbles.take();
        if (next.done) {
          const answered = delivered > 0 || reacted;
          if (next.error !== undefined && !answered) throw next.error;
          if (next.error !== undefined) console.error("Tibo reply cut short", next.error);
          if (!answered) throw new Error("The model sent an empty reply");
          return true;
        }
        // The pause counts from when typing showed, so a slow model doesn't add to it.
        const wait = typingDelayMs(next.value) - (Date.now() - typingSince);
        if (wait > 0) await sleep(wait);
        const message = this.thread.add({
          role: "tibo",
          body: next.value,
          turnId,
          meta: { model: MODEL },
        });
        delivered += 1;
        this.send({ type: "bubble", message });
        // More may come: keep typing until the stream says otherwise.
        typingSince = Date.now();
        if (!bubbles.drained) this.send({ type: "typing", on: true });
      }
    } finally {
      this.send({ type: "typing", on: false });
      await produce;
    }
  }

  // ─── Frames ──────────────────────────────────────────────────────────────

  /** To every open tab of this user. */
  private send(frame: TiboServerFrame) {
    this.broadcast(JSON.stringify(frame));
  }

  private sendTo(connection: Connection, frame: TiboServerFrame) {
    connection.send(JSON.stringify(frame));
  }
}

/** A client frame, or `null` for anything malformed (dropped silently). */
function parseFrame(raw: WSMessage): TiboClientFrame | null {
  if (typeof raw !== "string") return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const frame = value as Record<string, unknown>;
  if (
    frame.type === "send" &&
    typeof frame.text === "string" &&
    typeof frame.clientId === "string" &&
    frame.clientId.length <= MAX_CLIENT_ID_LENGTH
  ) {
    const replyTo = typeof frame.replyTo === "string" && frame.replyTo.length <= 64 ? frame.replyTo : undefined;
    return { type: "send", text: frame.text, clientId: frame.clientId, ...(replyTo ? { replyTo } : {}) };
  }
  if (
    frame.type === "react" &&
    typeof frame.messageId === "string" &&
    frame.messageId.length <= 64 &&
    (frame.emoji === null || (typeof frame.emoji === "string" && frame.emoji.length <= 16))
  ) {
    return { type: "react", messageId: frame.messageId, emoji: frame.emoji as string | null };
  }
  if (frame.type === "loadOlder" && typeof frame.beforeId === "string" && frame.beforeId.length <= 64) {
    return { type: "loadOlder", beforeId: frame.beforeId };
  }
  return null;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A one-reader queue: `take` waits for the next value, or the end (with its error). */
class Channel<T> {
  #items: T[] = [];
  #closed = false;
  #error: unknown = undefined;
  #waiter: (() => void) | undefined;

  put(value: T) {
    this.#items.push(value);
    this.#wake();
  }

  /** Closed with nothing left to take. */
  get drained() {
    return this.#closed && this.#items.length === 0;
  }

  close(error?: unknown) {
    this.#closed = true;
    this.#error = error;
    this.#wake();
  }

  async take(): Promise<{ done: false; value: T } | { done: true; error: unknown }> {
    while (this.#items.length === 0 && !this.#closed) {
      await new Promise<void>((resolve) => (this.#waiter = resolve));
    }
    if (this.#items.length > 0) return { done: false, value: this.#items.shift() as T };
    return { done: true, error: this.#error };
  }

  #wake() {
    const waiter = this.#waiter;
    this.#waiter = undefined;
    waiter?.();
  }
}

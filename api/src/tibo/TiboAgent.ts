/// <reference types="@cloudflare/workers-types" />

import { Agent, type Connection, type ConnectionContext, type WSMessage } from "agents";
import { isStepCount, streamText } from "ai";
import type { AgentEnv } from "../AgentWorker.ts";
import { AI_UNITS_PER_MESSAGE } from "../domain/usage-constants.ts";
import { tiboClient, usageClient } from "../domain-client.ts";
import { MAX_CHAT_MESSAGE_LENGTH } from "../limits.ts";
import { MAX_TOOL_STEPS, PendingActions, TurnLedger, receiptFor, type PendingAction } from "./actions.ts";
import { BUBBLE_DELIMITER, BubbleSplitter, reactionLine, reactionOf, typingDelayMs } from "./bubbles.ts";
import { RECENT_WINDOW, buildTurnContext, type ContextSection, type TurnContext } from "./context.ts";
import { dayIn } from "./dates.ts";
import { MODEL, museSpark } from "./model.ts";
import { PERSONA } from "./persona.ts";
import {
  TIBO_HISTORY_PAGE,
  TIBO_MAX_BUBBLES,
  TIBO_OLDER_PAGE,
  type TiboClientFrame,
  type TiboConfirm,
  type TiboReceipt,
  type TiboServerFrame,
} from "./protocol.ts";
import { todaySnapshot } from "./snapshot.ts";
import { Thread } from "./thread.ts";
import { tiboTools } from "./tools.ts";
import type { DayJson, SessionJson } from "./views.ts";

/** Lines Tibo "says" when something breaks. Shown once, never stored or charged. */
const ERROR_BUBBLES = {
  model: "Okay, my brain just blue-screened. Nothing got sent, nothing got charged. Try me again in a sec?",
  rateLimit: "Whoa, you're typing faster than I can think, and I think FAST. Give me a minute, then hit me again.",
} as const;

/** Said when a turn changed things or held them but wrote no text of its own. */
const QUIET_BUBBLES = {
  done: "Done!",
  held: "Just need your go-ahead on this one.",
  capped: "That's as much as I can do in one go. Want me to keep going?",
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
  private actionStore: PendingActions | undefined;
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

  /** Actions held for the user's go-ahead (`./actions.ts`). */
  private get actions() {
    if (!this.actionStore) {
      this.actionStore = new PendingActions(this.ctx.storage.sql);
      this.actionStore.migrate();
    }
    return this.actionStore;
  }

  onStart() {
    void this.thread;
    void this.actions;
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

    if (frame.type === "confirm") {
      void this.answerPending(frame.actionId, frame.approve).catch((error: unknown) => {
        console.error("Answering a held action failed", error);
        this.sendTo(connection, { type: "error", message: "That didn't go through. Please try again." });
      });
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
    const usage = usageClient(this.env.DOMAIN);
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
        tiboClient(this.env.DOMAIN).profile(userId),
      ]);
      if (!allowed) {
        this.send({ type: "limitReached", limit: current.limit });
        this.send({ type: "usage", remaining: current.remaining, limit: current.limit });
        return;
      }

      // Tibo has read everything so far: double ticks.
      const seen = this.thread.markSeen();
      if (seen.length > 0) this.send({ type: "seen", messageIds: seen });

      // 3. The context, built fresh, with the user's day as it is now.
      const now = new Date();
      const today = dayIn(profile.timeZone, now);
      const snapshot = await this.snapshot(today, profile.timeZone);
      const recent = this.thread.latest(RECENT_WINDOW).messages;
      const context = buildTurnContext({
        persona: PERSONA,
        profile,
        now,
        recent,
        sections: snapshot ? [snapshot] : [],
      });
      // Tibo may react to the newest thing the user said.
      const latestUserMessage = recent.findLast((message) => message.role === "user");

      // Held actions can be answered in words only by a message the user
      // typed after they were held. Every turn is started by the user's own
      // messages today; a turn started any other way (relays, step 21)
      // must not offer this.
      const pending = this.actions.current(now.getTime());
      const confirmable = pending !== null && this.thread.lastUserSeq() > pending.afterSeq;
      const ledger = new TurnLedger();
      const tools = tiboTools({
        domain: this.env.DOMAIN,
        userId,
        timeZone: profile.timeZone,
        today,
        ledger,
        confirmPending: confirmable ? (approve) => this.answerPending(pending.id, approve) : null,
      });

      // 4–6. Stream the reply, and deliver it bubble by bubble.
      const answered = await this.reply(turnId, context, latestUserMessage?.id ?? null, tools, ledger);

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
  private async reply(
    turnId: string,
    context: TurnContext,
    reactTo: string | null,
    tools: ReturnType<typeof tiboTools>,
    ledger: TurnLedger,
  ): Promise<boolean> {
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

    // Tools run in steps; the whole turn is still one message of quota.
    const result = streamText({
      model: museSpark(this.env, this.name),
      system: context.system,
      messages: context.messages,
      tools,
      stopWhen: isStepCount(MAX_TOOL_STEPS),
    });
    let capped = false;
    const produce = (async () => {
      for await (const part of result.fullStream) {
        if (part.type === "error") throw part.error;
        if (part.type === "text-delta") {
          for (const bubble of splitter.push(part.text)) bubbles.put(bubble);
          takeReaction();
        }
        // Text before a tool call ("On it!") and after it ("Done!") are
        // separate bubbles, not one run-on line.
        if (part.type === "finish-step") {
          for (const bubble of splitter.push(`\n${BUBBLE_DELIMITER}\n`)) bubbles.put(bubble);
          capped = part.finishReason === "tool-calls";
        }
      }
      for (const bubble of splitter.finish()) bubbles.put(bubble);
      takeReaction();
      // Stopped by the step limit mid-work: its last words may promise
      // something that never ran, so say where things stand.
      if (capped) bubbles.put(QUIET_BUBBLES.capped);
      // Changes with nothing said about them still get a line to hang the
      // receipts or the confirm buttons on.
      else if (!splitter.emittedAny && (ledger.receipts.length > 0 || ledger.held.length > 0)) {
        bubbles.put(ledger.held.length > 0 ? QUIET_BUBBLES.held : QUIET_BUBBLES.done);
      }
    })().then(
      () => bubbles.close(),
      (error: unknown) => bubbles.close(error),
    );

    let delivered = 0;
    let lastBubbleId: string | null = null;
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
          if (lastBubbleId) this.settleTurnActions(lastBubbleId, ledger);
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
        lastBubbleId = message.id;
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

  // ─── Acting on the user's data ───────────────────────────────────────────

  /** The today snapshot, or `null` (logged) if the domain couldn't answer. */
  private async snapshot(today: string, timeZone: string): Promise<ContextSection | null> {
    try {
      const [day, active] = await Promise.all([
        this.env.DOMAIN.run(this.name, "GetDay", { date: today }),
        this.env.DOMAIN.run(this.name, "GetActiveSession", undefined),
      ]);
      if (!day.ok || !active.ok) {
        console.error("Today snapshot failed", day.ok ? null : day.error, active.ok ? null : active.error);
        return null;
      }
      return todaySnapshot({
        day: day.value as DayJson,
        activeSession: active.value as SessionJson | null,
        timeZone,
      });
    } catch (error) {
      console.error("Today snapshot failed", error);
      return null;
    }
  }

  /**
   * After a turn's bubbles: its receipts and held actions go on its last
   * bubble, and every tab learns which lists changed.
   */
  private settleTurnActions(lastBubbleId: string, ledger: TurnLedger) {
    if (ledger.receipts.length > 0) this.setMeta(lastBubbleId, "receipts", ledger.receipts);
    if (ledger.held.length > 0) {
      const { action, expired } = this.actions.hold({
        messageId: lastBubbleId,
        afterSeq: this.thread.lastSeq(),
        calls: ledger.held,
        now: Date.now(),
      });
      for (const old of expired) this.setConfirm(old, "expired");
      this.setConfirm(action, "pending");
    }
    if (ledger.changed.size > 0) this.send({ type: "changed", keys: [...ledger.changed] });
  }

  /**
   * The user's answer to a held action: from the Confirm or Cancel buttons,
   * or in words through `confirm_action`. On a yes, runs the stored calls as
   * they were summarized, in order, with no model call. Answers stale
   * actions with their state, so the buttons can't run anything twice.
   */
  private async answerPending(actionId: string, approve: boolean) {
    const action = this.actions.get(actionId);
    if (!action) return { error: "Nothing is waiting for the user's go-ahead." };
    if (action.status === "pending" && action.expiresAt <= Date.now()) {
      this.actions.settle(action.id, "expired");
      this.setConfirm(action, "expired");
      return { error: "That expired. Ask again if it's still wanted." };
    }
    const settled = this.actions.settle(action.id, approve ? "confirmed" : "cancelled");
    if (!settled) {
      // Already answered (another tab, a double tap): resend its state.
      const message = this.thread.get(action.messageId);
      if (message) this.send({ type: "updated", message });
      return { error: "That was already answered." };
    }
    this.setConfirm(settled, approve ? "confirmed" : "cancelled");
    if (!approve) return { status: "cancelled", nothingChanged: true };

    const receipts: TiboReceipt[] = [];
    const changed = new Set<string>();
    for (const call of settled.calls) {
      const result = await this.env.DOMAIN.run(this.name, call.rpc, call.payload).catch((error: unknown) => {
        console.error("A held action failed", call.rpc, error);
        return { ok: false as const, error: { tag: "Unavailable", message: "Couldn't reach the app." } };
      });
      if (result.ok) {
        receipts.push(receiptFor(call, result.value));
        for (const key of call.keys) changed.add(key);
      } else {
        receipts.push({ text: `${call.summary}: ${result.error.message}`, failed: true });
      }
    }
    const message = this.thread.get(settled.messageId);
    this.setMeta(settled.messageId, "receipts", [...(message?.receipts ?? []), ...receipts]);
    if (changed.size > 0) this.send({ type: "changed", keys: [...changed] });
    return { status: "done", results: receipts };
  }

  private setConfirm(action: PendingAction, status: TiboConfirm["status"]) {
    const confirm: TiboConfirm = {
      actionId: action.id,
      items: action.calls.map((call) => ({
        text: call.summary,
        ...(call.item?.id ? { item: { kind: call.item.kind, id: call.item.id, ...(call.item.title ? { title: call.item.title } : {}) } } : {}),
      })),
      status,
    };
    this.setMeta(action.messageId, "confirm", confirm);
  }

  private setMeta(messageId: string, key: "receipts" | "confirm", value: unknown) {
    const message = this.thread.setMeta(messageId, key, value);
    if (message) this.send({ type: "updated", message });
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
  if (
    frame.type === "confirm" &&
    typeof frame.actionId === "string" &&
    frame.actionId.length <= 64 &&
    typeof frame.approve === "boolean"
  ) {
    return { type: "confirm", actionId: frame.actionId, approve: frame.approve };
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

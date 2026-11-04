/// <reference types="@cloudflare/workers-types" />

import { Agent, type Connection, type ConnectionContext, type WSMessage } from "agents";
import { asSchema, isStepCount, streamText, type ToolSet } from "ai";
import type { AgentEnv } from "../AgentWorker.ts";
import { AI_UNITS_PER_MESSAGE } from "../domain/usage-constants.ts";
import {
  tiboClient,
  usageClient,
  type TiboEventJson,
  type TiboProactiveContext,
} from "../domain-client.ts";
import { MAX_CHAT_MESSAGE_LENGTH } from "../limits.ts";
import { MAX_TOOL_STEPS, PendingActions, TurnLedger, receiptFor, type PendingAction } from "./actions.ts";
import { BUBBLE_DELIMITER, BubbleSplitter, reactionLine, reactionOf, typingDelayMs } from "./bubbles.ts";
import { RECENT_WINDOW, buildTurnContext, type ContextSection, type TurnContext } from "./context.ts";
import { addDays, dayIn, instantIn, startOfDayIn } from "./dates.ts";
import { devSeedThread } from "./dev-seed.ts";
import { MemoryJobs, type JobContext } from "./memory-jobs.ts";
import { MemoryStore } from "./memory.ts";
import { DAILY_JOB_CAP, DEV_DAILY_JOB_CAP, SETTLE_MS, estimateTokens } from "./memory-rules.ts";
import { MODEL, museSpark } from "./model.ts";
import { PERSONA } from "./persona.ts";
import { ProactiveStore, type CheckInOutcome } from "./proactive.ts";
import {
  MAX_PENDING_REMINDERS,
  REMINDER_LATE_MS,
  ReminderStore,
  reminderInstant,
  reminderWhen,
} from "./reminders.ts";
import {
  PLAN_GRACE_MS,
  PROACTIVE_KINDS,
  SCHEDULED_KINDS,
  checkInFocus,
  checkInSection,
  gate,
  nextSlot,
  planFingerprint,
  slotStillPlanned,
  slotTime,
  triggerLine,
  type CheckInFocus,
  type GateInput,
  type ProactiveKind,
  type ProactiveSlot,
  type SkipReason,
} from "./proactive-rules.ts";
import {
  MemoryRefs,
  deleteMemories,
  forget,
  memoriesSection,
  recallMemories,
  remember,
  searchConversation,
  storySection,
  type RecallContext,
} from "./recall.ts";
import {
  TIBO_HISTORY_PAGE,
  TIBO_MAX_BUBBLES,
  TIBO_MEMORIES_LIMIT,
  TIBO_MEMORIES_PATH,
  TIBO_OLDER_PAGE,
  type TiboMemory,
  type TiboClientFrame,
  type TiboConfirm,
  type TiboMessage,
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

/** Memory jobs run this long after a turn, so a burst of turns shares one run. */
const MEMORY_JOB_DELAY_S = 60;
/** …and this long after a run that stopped with work left. */
const MEMORY_JOB_CONTINUE_S = 5;
/** Past the user's midnight, so a finished day gets its summary. */
const DAY_END_GRACE_MS = 5 * 60_000;

/** A check-in about to be considered (`./proactive-rules.ts`). */
interface CheckInTrigger {
  /** Its log id: `morning_plan:2026-11-04`. */
  readonly id: string;
  readonly kind: ProactiveKind;
  /** Its local day. */
  readonly day: string;
  /** When it was meant for (ms). */
  readonly at: number;
}

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
  private memoryStore: MemoryStore | undefined;
  private proactiveStore: ProactiveStore | undefined;
  private reminderStore: ReminderStore | undefined;
  /** A memory job is running (in memory: a restart drops it, and its schedule retries). */
  private memoryJobRunning = false;
  /** Another job run was asked for while one ran. */
  private memoryJobOwed = false;
  /** Memories the jobs just wrote, with vectors, until Vectorize can find them (`JobContext.fresh`). */
  private readonly freshMemories: JobContext["fresh"] = [];
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

  /** Summaries, memories and thread chunks (`./memory.ts`). */
  private get memory() {
    if (!this.memoryStore) {
      this.memoryStore = new MemoryStore(this.ctx.storage.sql);
      this.memoryStore.migrate();
    }
    return this.memoryStore;
  }

  /** Check-ins sent and the agent's own facts (`./proactive.ts`). */
  private get proactive() {
    if (!this.proactiveStore) {
      this.proactiveStore = new ProactiveStore(this.ctx.storage.sql);
      this.proactiveStore.migrate();
    }
    return this.proactiveStore;
  }

  /** Reminders the user asked for in chat (`./reminders.ts`). */
  private get reminders() {
    if (!this.reminderStore) {
      this.reminderStore = new ReminderStore(this.ctx.storage.sql);
      this.reminderStore.migrate();
    }
    return this.reminderStore;
  }

  private get dev() {
    return this.env.TIBO_DEV === "true";
  }

  onStart() {
    void this.thread;
    void this.actions;
    void this.memory;
    void this.reminders;
    this.proactive.prune(Date.now());
  }

  /** The thread lives in SQL, not in Agent state; browsers may not write state. */
  validateStateChange(_next: unknown, source: Connection | "server") {
    if (source !== "server") throw new Error("Read-only");
  }

  onConnect(connection: Connection, _ctx: ConnectionContext) {
    // Every open app tab keeps a socket, so this is when the user was last around.
    this.proactive.set("last_seen_at", Date.now());
    // A thread with no read mark yet (before step 20) starts all read.
    let readSeq = this.proactive.getNumber("read_seq");
    if (readSeq === null) {
      readSeq = this.thread.lastSeq();
      this.proactive.set("read_seq", readSeq);
    }
    const { messages, hasMore } = this.thread.latest(TIBO_HISTORY_PAGE);
    this.sendTo(connection, { type: "history", messages, hasMore, unread: this.thread.tiboAfter(readSeq) });
    // The first time (a new user, or one from before check-ins), arm them.
    if (this.proactive.get("proactive_plan") === null) {
      void this.planProactive().catch((error: unknown) => console.error("Planning check-ins failed", error));
    }
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

    if (frame.type === "read") {
      this.proactive.set("read_seq", this.thread.lastSeq());
      this.send({ type: "read" });
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
    this.proactive.set("last_seen_at", Date.now());
    this.requestTurn();
  }

  /**
   * Account deletion (`domain/tibo.ts`): drops the thread and everything
   * else this agent stored. Called over RPC by the AgentWorker's wipe cron.
   */
  async wipe() {
    for (const connection of this.getConnections()) connection.close(4000, "Account deleted");
    // Its vectors first: Vectorize can't drop a namespace, so every vector
    // id this agent ever wrote is deleted (a failure throws, and the wipe
    // cron retries before anything else is gone).
    await this.deleteAllVectors();
    await this.destroy();
  }

  private async deleteAllVectors() {
    const ids = this.memory.allVectorIds();
    for (let start = 0; start < ids.length; start += 500) {
      await this.env.MEMORY.deleteByIds(ids.slice(start, start + 500));
    }
  }

  // ─── HTTP: Settings → Tibo → Memory, and dev tools ───────────────────────

  /**
   * `/agents/tibo-agent/<user id>/…` over HTTP. The web stack's proxy signs
   * the user in and pins the name to them, so these only ever reach the
   * caller's own memories. See `TIBO_MEMORIES_PATH` in `./protocol.ts`.
   */
  async onRequest(request: Request): Promise<Response> {
    const [, , , , ...rest] = new URL(request.url).pathname.split("/");
    const route = rest.map(decodeURIComponent);

    if (route[0] === TIBO_MEMORIES_PATH && route.length === 1 && request.method === "GET") {
      const memories: TiboMemory[] = this.memory.listActive(TIBO_MEMORIES_LIMIT).map(
        ({ id, text, kind, createdAt, updatedAt }) => ({ id, text, kind, createdAt, updatedAt }),
      );
      return Response.json({ memories });
    }
    if (route[0] === TIBO_MEMORIES_PATH && route.length === 2 && request.method === "DELETE") {
      const memory = this.memory.memory(route[1]!);
      if (!memory || memory.supersededBy !== null) return Response.json({ error: "Not found" }, { status: 404 });
      await deleteMemories(this.env, this.memory, [memory.id]);
      return Response.json({ ok: true });
    }
    if (route[0] === "dev" && this.dev) return this.devRoute(route[1], request);
    return new Response("Not found", { status: 404 });
  }

  /**
   * Development only (`alchemy dev`): `POST dev/seed` replaces this thread
   * and its memory with the synthetic one in `./dev-seed.ts` and starts the
   * memory jobs; `POST dev/memory-jobs` runs them now; `GET dev/memory`
   * shows what they've built.
   */
  private async devRoute(action: string | undefined, request: Request): Promise<Response> {
    if (action === "seed" && request.method === "POST") {
      await this.deleteAllVectors();
      this.thread.clear();
      this.memory.clear();
      const seeded = devSeedThread();
      for (const message of seeded) {
        this.thread.add({
          role: message.role,
          body: message.body,
          createdAt: message.createdAt,
          ...(message.role === "tibo" ? { turnId: message.turnId, meta: { model: MODEL } } : {}),
        });
      }
      await this.scheduleMemoryJobs(1, "dev");
      return Response.json({ inserted: seeded.length });
    }
    if (action === "check-in" && request.method === "POST") return this.devCheckIn(request);
    if (action === "check-ins" && request.method === "GET") return this.devCheckIns();
    if (action === "alarm" && request.method === "POST") return this.devAlarm(request);
    if (action === "memory-jobs" && request.method === "POST") {
      await this.scheduleMemoryJobs(1, "dev");
      return Response.json({ scheduled: true });
    }
    if (action === "memory" && request.method === "GET") {
      // The whole index (dev has one user), as Vectorize last counted it: it
      // lags writes and deletes by a few seconds.
      const index = await this.env.MEMORY.describe().catch((error: unknown) => {
        console.error("Describing the memory index failed", error);
        return null;
      });
      return Response.json({
        stats: this.memory.stats(),
        vectorsInIndex: index ? { count: index.vectorCount, processedUpTo: index.processedUpToDatetime } : null,
        running: this.memoryJobRunning,
        summaries: (["year", "month", "week", "day"] as const).map((level) => ({
          level,
          latest: this.memory.latestSummaries(level, 50).map(({ periodStart, text }) => ({ periodStart, text })),
        })),
        memories: this.memory.listActive(200),
        superseded: this.ctx.storage.sql
          .exec(`SELECT id, text, superseded_by FROM memories WHERE superseded_by IS NOT NULL`)
          .toArray(),
      });
    }
    return new Response("Not found", { status: 404 });
  }

  /**
   * Development only: `POST dev/check-in?kind=<kind>[&bypass=quiet,stale|all]`
   * runs a check-in now, through the same rules as an alarm (or past the
   * named ones), and answers its outcome.
   */
  private async devCheckIn(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") as ProactiveKind | null;
    if (!kind || !PROACTIVE_KINDS.includes(kind)) {
      return Response.json({ error: `kind is one of ${PROACTIVE_KINDS.join(", ")}` }, { status: 400 });
    }
    const bypass = new Set((url.searchParams.get("bypass") ?? "").split(",").filter(Boolean)) as Set<SkipReason | "all">;
    const context = await tiboClient(this.env.DOMAIN).proactive(this.name);
    const now = Date.now();
    const day = dayIn(context.timeZone, new Date(now));
    const outcome = await this.checkIn(
      { id: `dev:${kind}:${now}`, kind, day, at: now },
      context,
      bypass,
    );
    return Response.json({ outcome, sentToday: this.proactive.sentOn(day) });
  }

  /**
   * Development only: `POST dev/alarm?kind=<timed kind>&at=HH:MM` arms a real
   * check-in alarm today at any minute (settings only take half hours), so
   * the alarm path runs without waiting for a planned slot. It skips the
   * "slot still planned" check and logs under a `dev:` id.
   */
  private async devAlarm(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") as ProactiveSlot["kind"] | null;
    const time = url.searchParams.get("at") ?? "";
    if (!kind || !(SCHEDULED_KINDS as readonly string[]).includes(kind) || !/^\d{2}:\d{2}$/.test(time)) {
      return Response.json({ error: `kind is one of ${SCHEDULED_KINDS.join(", ")}; at is HH:MM` }, { status: 400 });
    }
    const context = await tiboClient(this.env.DOMAIN).proactive(this.name);
    const day = dayIn(context.timeZone, new Date());
    const slot: ProactiveSlot = { kind, day, at: instantIn(context.timeZone, day, time), dev: true };
    await this.armSlot(slot);
    return Response.json({ armed: { ...slot, firesAt: new Date(slot.at).toISOString() } });
  }

  /** Development only: `GET dev/check-ins`: the armed alarms, the log and the facts they read. */
  private async devCheckIns(): Promise<Response> {
    const lastSeenAt = this.proactive.getNumber("last_seen_at");
    const lastMessageAt = this.thread.lastMessageAt();
    return Response.json({
      plan: JSON.parse(this.proactive.get("proactive_plan") ?? "null"),
      armed: await this.armedSlots(),
      log: this.proactive.recent(30),
      lastSeenAt: lastSeenAt === null ? null : new Date(lastSeenAt).toISOString(),
      lastMessageAt: lastMessageAt === null ? null : new Date(lastMessageAt).toISOString(),
      readSeq: this.proactive.getNumber("read_seq"),
      lastSeq: this.thread.lastSeq(),
      reminders: this.reminders.pending(),
      usage: await usageClient(this.env.DOMAIN)
        .get(this.name)
        .catch(() => null),
    });
  }

  // ─── Long-term memory jobs ───────────────────────────────────────────────

  /**
   * Schedules a memory job run `delaySeconds` from now (Agents SDK
   * `schedule`, on the DO's alarm). Runs asked for within the same minute
   * share one schedule.
   */
  private async scheduleMemoryJobs(delaySeconds: number, reason: string) {
    const at = Date.now() + delaySeconds * 1000;
    await this.schedule(new Date(at), "runMemoryJobs", { reason, minute: Math.floor(at / 60_000) }, { idempotent: true });
  }

  /**
   * One run of the memory jobs (`./memory-jobs.ts`), then the next one: soon
   * if work is left, tomorrow if today's budget ran out, and otherwise when
   * the thread goes quiet and when the user's day ends, while anything is
   * unread. Never during a reply's critical path, and never charged.
   */
  async runMemoryJobs(_payload?: { reason: string; minute: number }) {
    if (this.memoryJobRunning) {
      this.memoryJobOwed = true;
      return;
    }
    this.memoryJobRunning = true;
    // If the agent restarts mid-run (a deploy, an eviction), nothing would
    // schedule the next one: this fallback does, and finds nothing to do
    // when the run ended well.
    await this.scheduleMemoryJobs(15 * 60, "watchdog");
    // A run takes minutes (each model call 15–30 s), and a schedule callback
    // that runs long holds up the agent's other jobs: detach it, kept alive
    // until it ends.
    void this.keepAliveWhile(() => this.memoryJobRun());
  }

  private async memoryJobRun() {
    try {
      const profile = await tiboClient(this.env.DOMAIN)
        .profile(this.name)
        .catch(() => null);
      if (profile) {
        this.memory.set("time_zone", profile.timeZone);
        this.memory.set("first_name", profile.firstName);
      }
      const timeZone = profile?.timeZone ?? this.memory.get("time_zone") ?? "UTC";
      const now = new Date();
      const outcome = await new MemoryJobs({
        env: this.env,
        userId: this.name,
        store: this.memory,
        thread: this.thread,
        timeZone,
        firstName: profile?.firstName ?? this.memory.get("first_name") ?? "the user",
        now,
        cap: this.dev ? DEV_DAILY_JOB_CAP : DAILY_JOB_CAP,
        fresh: this.freshMemories,
        log: this.dev ? (...args) => console.log("Tibo memory job:", ...args) : () => {},
      }).run();
      if (this.dev) console.log("Tibo memory job", this.name, outcome, this.memory.stats());

      const tomorrow = startOfDayIn(timeZone, addDays(dayIn(timeZone, now), 1)) + DAY_END_GRACE_MS;
      if (outcome.outOfBudget) {
        await this.scheduleMemoryJobs((tomorrow - Date.now()) / 1000, "budget");
      } else if (outcome.more || this.memoryJobOwed) {
        await this.scheduleMemoryJobs(MEMORY_JOB_CONTINUE_S, "continue");
      } else if (this.thread.countAfter(this.memory.getNumber("summarized_seq")) > 0) {
        // Unread messages wait for the thread to settle, and for the day to end.
        const last = this.thread.latest(1).messages[0];
        const settle = (last?.createdAt ?? Date.now()) + SETTLE_MS + 60_000;
        const unread = Math.min(this.memory.getNumber("chunked_seq"), this.memory.getNumber("extracted_seq"));
        if (settle > Date.now() && this.thread.countAfter(unread) > 0) {
          await this.scheduleMemoryJobs((settle - Date.now()) / 1000, "settle");
        }
        await this.scheduleMemoryJobs((tomorrow - Date.now()) / 1000, "dayEnd");
      }
    } catch (error) {
      console.error("Tibo memory job failed", this.name, error);
      await this.scheduleMemoryJobs(10 * 60, "retry");
    } finally {
      this.memoryJobRunning = false;
      this.memoryJobOwed = false;
    }
  }

  // ─── Check-ins: Tibo messages first (step 20) ─────────────────────────────

  /**
   * Arms the check-in alarms from the user's settings, in their zone:
   * cancels every armed one, then schedules the next slot of each timed
   * kind that's on (Agents SDK `schedule`, on the DO's alarm). Runs on the
   * first connect, when a `settings_changed` event arrives (a setting or
   * the zone changed), and when an alarm finds the plan out of date.
   * `firing` is the alarm running now: it's left alone, and its kind moves
   * to its next slot.
   */
  private async planProactive(given?: TiboProactiveContext, firing?: { slot: ProactiveSlot; scheduleId: string }) {
    const context = given ?? (await tiboClient(this.env.DOMAIN).proactive(this.name));
    for (const schedule of await this.listSchedules()) {
      if (schedule.callback === "proactiveFire" && schedule.id !== firing?.scheduleId) {
        await this.cancelSchedule(schedule.id);
      }
    }
    const now = Date.now();
    for (const kind of SCHEDULED_KINDS) {
      const time = slotTime(kind, context.proactive);
      if (!time) continue;
      await this.armSlot(
        firing?.slot.kind === kind
          ? nextSlot(kind, context.timeZone, time, Math.max(now, firing.slot.at))
          : // A slot that came due a moment ago is kept: the log stops a repeat.
            nextSlot(kind, context.timeZone, time, now, PLAN_GRACE_MS),
      );
    }
    this.proactive.set("proactive_plan", planFingerprint(context.proactive, context.timeZone));
    if (this.dev) console.log("Tibo check-ins planned", this.name, await this.armedSlots());
  }

  private armSlot(slot: ProactiveSlot) {
    return this.schedule(new Date(slot.at), "proactiveFire", slot, { idempotent: true });
  }

  /** The armed check-in alarms (dev route, logs). */
  private async armedSlots() {
    return (await this.listSchedules())
      .filter((schedule) => schedule.callback === "proactiveFire")
      .map((schedule) => ({ ...(schedule.payload as ProactiveSlot), firesAt: new Date(schedule.time * 1000).toISOString() }));
  }

  /**
   * A check-in alarm (scheduled by `planProactive`). Returns at once: the
   * turn takes a model call, longer than a schedule callback should hold
   * the agent's other jobs.
   */
  async proactiveFire(slot: ProactiveSlot, schedule?: { id: string }) {
    void this.keepAliveWhile(() =>
      this.runSlot(slot, schedule?.id ?? "").catch((error: unknown) => console.error("Tibo check-in alarm failed", slot, error)),
    );
  }

  /** Retries planning after the settings couldn't be read. */
  async replanProactive() {
    await this.planProactive().catch((error: unknown) => {
      console.error("Re-planning check-ins failed", error);
      return this.schedule(10 * 60, "replanProactive", { retry: true }, { idempotent: true });
    });
  }

  private async runSlot(slot: ProactiveSlot, scheduleId: string) {
    let context: TiboProactiveContext;
    try {
      context = await tiboClient(this.env.DOMAIN).proactive(this.name);
    } catch (error) {
      // Today's goes unsent; the retry re-arms the next ones.
      console.error("Reading check-in settings failed", error);
      await this.schedule(5 * 60, "replanProactive", { retry: true }, { idempotent: true });
      return;
    }
    if (this.proactive.get("proactive_plan") !== planFingerprint(context.proactive, context.timeZone)) {
      // Settings or the zone moved and the event saying so was lost: re-plan,
      // and send this one only if it still stands.
      await this.planProactive(context, { slot, scheduleId });
    } else {
      // Re-arm: the same kind, at its next slot (tomorrow, or later if this one fired late).
      const time = slotTime(slot.kind, context.proactive);
      if (time) await this.armSlot(nextSlot(slot.kind, context.timeZone, time, Math.max(Date.now(), slot.at)));
    }
    if (!slot.dev && !slotStillPlanned(slot, context.proactive, context.timeZone)) return;
    const id = slot.dev ? `dev:${slot.kind}:${slot.at}` : `${slot.kind}:${slot.day}`;
    await this.checkIn({ id, kind: slot.kind, day: slot.day, at: slot.at }, context);
  }

  /**
   * Domain events from the outbox (`domain/tibo.ts`), delivered by the
   * AgentWorker's cron over RPC: a changed setting or zone re-plans the
   * check-ins. Throws if the settings can't be read, so the cron delivers
   * them again.
   */
  async deliverEvents(events: readonly TiboEventJson[]) {
    if (events.some((event) => event.kind === "settings_changed")) await this.planProactive();
    return { ok: true as const };
  }

  /**
   * Considers one check-in: the log (never twice), the rules
   * (`gate`: switches, staleness, dormancy, a running turn,
   * mid-conversation quiet), whether the user's day gives Tibo something
   * useful to say, and the quota. Skips silently; otherwise runs the turn.
   * `bypass` is for the dev route only.
   */
  private async checkIn(
    trigger: CheckInTrigger,
    context: TiboProactiveContext,
    bypass: ReadonlySet<SkipReason | "all"> = new Set(),
  ): Promise<CheckInOutcome | "duplicate"> {
    const now = Date.now();
    if (!this.proactive.claim(trigger.id, trigger.kind, trigger.day, now)) return "duplicate";
    const skip = (reason: SkipReason) => {
      this.proactive.finish(trigger.id, reason);
      if (this.dev) console.log("Tibo check-in skipped", trigger.id, reason);
      return reason;
    };
    const reason = gateWith(
      {
        kind: trigger.kind,
        settings: context.proactive,
        now,
        at: trigger.at,
        lastMessageAt: this.thread.lastMessageAt(),
        busy: this.running,
        lastSeenAt: this.proactive.getNumber("last_seen_at"),
      },
      bypass,
    );
    if (reason) return skip(reason);

    const board = await this.board(dayIn(context.timeZone, new Date(now)));
    const focus = checkInFocus(trigger.kind, board?.day ?? null);
    if (!focus) return skip(board ? "nothing" : "failed");
    // Out of quota: silently nothing (the composer's notice covers it).
    const { allowed } = await usageClient(this.env.DOMAIN)
      .check(this.name, AI_UNITS_PER_MESSAGE)
      .catch(() => ({ allowed: false }));
    if (!allowed) return skip("quota");
    // A turn may have started while this waited.
    if (this.running) return skip("busy");
    const { outcome } = await this.exclusive(
      () => this.checkInTurn(trigger, context, focus, board),
      ({ eventSeq }) => eventSeq,
    );
    return outcome;
  }

  /**
   * A turn Tibo starts: an app event row (hidden in the app) records why,
   * then the reply streams as normal bubbles to every tab, with no tools.
   * Charged as one `tibo_proactive` message once a bubble showed. A turn
   * that showed nothing takes its event row back and isn't charged.
   */
  private async checkInTurn(
    trigger: CheckInTrigger,
    context: TiboProactiveContext,
    focus: CheckInFocus,
    board: { day: DayJson; activeSession: SessionJson | null } | null,
  ): Promise<{ outcome: CheckInOutcome; eventSeq: number }> {
    const turnId = crypto.randomUUID();
    const time = slotTime(trigger.kind, context.proactive) ?? "00:00";
    const event = this.thread.add({
      role: "system_event",
      body: triggerLine(focus, time),
      turnId,
      meta: { checkIn: trigger.kind },
    });
    const eventSeq = this.thread.lastSeq();
    try {
      const now = new Date();
      const today = dayIn(context.timeZone, now);
      const recall: RecallContext = {
        env: this.env,
        userId: this.name,
        store: this.memory,
        thread: this.thread,
        timeZone: context.timeZone,
        today,
      };
      const refs = new MemoryRefs();
      const memories = await recallMemories(recall, [event.body, ...focus.items].join("\n"));
      const sections = [
        board ? todaySnapshot({ ...board, timeZone: context.timeZone }) : null,
        storySection(this.memory, today),
        memoriesSection(memories, refs, context.timeZone),
        checkInSection(focus),
      ].filter((section): section is ContextSection => section !== null);
      const turnContext = buildTurnContext({
        persona: PERSONA,
        profile: { firstName: context.firstName, timeZone: context.timeZone },
        now,
        recent: this.thread.latest(RECENT_WINDOW).messages,
        sections,
      });
      await this.reply(turnId, turnContext, null, {}, new TurnLedger());
      this.proactive.finish(trigger.id, "sent", turnId);
      const after = await usageClient(this.env.DOMAIN)
        .record(this.name, AI_UNITS_PER_MESSAGE, "tibo_proactive", turnId)
        .catch((error: unknown) => {
          console.error("Recording AI usage failed", error);
          return null;
        });
      if (after) this.send({ type: "usage", remaining: after.remaining, limit: after.limit });
      await this.notifyUser({ kind: trigger.kind, turnId });
      if (this.dev) console.log("Tibo check-in sent", trigger.id);
      return { outcome: "sent", eventSeq };
    } catch (error) {
      console.error("Tibo check-in failed", trigger.id, error);
      this.thread.remove(event.id);
      this.proactive.finish(trigger.id, "failed");
      return { outcome: "failed", eventSeq };
    } finally {
      this.send({ type: "turnDone", turnId });
    }
  }

  // ─── Reminders the user asks for ─────────────────────────────────────────

  /** The reminder tools' backends for one turn (`./tools.ts`). */
  private reminderTools(timeZone: string, today: string) {
    return {
      set: async (input: { date: string; time: string; about: string; message: string }) => {
        if (this.reminders.countPending() >= MAX_PENDING_REMINDERS) {
          return { error: `They already have ${MAX_PENDING_REMINDERS} reminders to come. Offer to cancel one first.` };
        }
        const now = Date.now();
        const when = reminderInstant(input, timeZone, now, today);
        if ("error" in when) return when;
        const reminder = this.reminders.add({
          at: when.at,
          about: input.about.trim(),
          message: input.message.trim(),
          now,
        });
        await this.schedule(new Date(when.at), "reminderFire", { id: reminder.id });
        // No receipt line: Tibo says it in its own words (like memories).
        return { status: "done", id: reminder.id, when: reminderWhen(when.at, timeZone, today) };
      },
      list: async () => ({
        reminders: this.reminders.pending().map((reminder) => ({
          id: reminder.id,
          when: reminderWhen(reminder.at, timeZone, today),
          about: reminder.about,
        })),
      }),
      cancel: async ({ id }: { id: string }) => {
        // Its alarm stays and finds it cancelled.
        const reminder = this.reminders.settle(id, "cancelled");
        if (!reminder) return { error: "No reminder to come has that id. List them first." };
        return { status: "done", cancelled: reminder.about };
      },
    };
  }

  /**
   * A reminder's alarm: sends the words Tibo wrote when it was set, as a
   * Tibo bubble after a short typing pause. No model call and no charge
   * (the turn that set it was charged), so quota can't stop it; the user
   * asked, so the check-in rules don't apply. Waits for a running reply to
   * finish; one delayed past `REMINDER_LATE_MS` is marked missed.
   */
  async reminderFire(payload: { id: string }) {
    const reminder = this.reminders.get(payload.id);
    if (!reminder || reminder.status !== "pending") return;
    if (Date.now() - reminder.at > REMINDER_LATE_MS) {
      this.reminders.settle(reminder.id, "missed");
      return;
    }
    if (this.running) {
      await this.schedule(15, "reminderFire", payload);
      return;
    }
    if (!this.reminders.settle(reminder.id, "sent")) return;
    const turnId = crypto.randomUUID();
    // Why Tibo spoke, for later turns (hidden in the app).
    this.thread.add({
      role: "system_event",
      body: `A reminder the user asked for came due (${reminder.about}); it was sent as written.`,
      turnId,
      meta: { reminder: reminder.id },
    });
    this.send({ type: "typing", on: true });
    await sleep(typingDelayMs(reminder.message));
    const message = this.thread.add({ role: "tibo", body: reminder.message, turnId, meta: { reminder: reminder.id } });
    this.send({ type: "typing", on: false });
    this.send({ type: "bubble", message });
    this.send({ type: "turnDone", turnId });
    await this.notifyUser({ kind: "reminder", turnId });
    if (this.dev) console.log("Tibo reminder sent", reminder.id);
  }

  /**
   * Tells the user Tibo wrote first. In the app only for now: the bubbles
   * were broadcast to every open tab, and the unread dot lights there or on
   * their next visit (`read_seq`). Step 23 adds web push here, for when no
   * tab is open (`this.getConnections()` is empty).
   */
  private async notifyUser(_note: { kind: ProactiveKind | "reminder"; turnId: string }) {}

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
    this.owed = false;
    void this.exclusive(
      () => this.turn(),
      () => Number.MAX_SAFE_INTEGER,
    );
  }

  /**
   * Runs `job` (a reply turn or a check-in) holding the turn lock, then a
   * reply turn while the user is owed one. Resolves with `job`'s result
   * while the queue goes on. `sinceSeq` is where `job`'s own exchange
   * started: a message the user sent after it is answered next, even though
   * Tibo's bubbles came after that message.
   */
  private exclusive<T>(job: () => Promise<T>, sinceSeq: (value: T) => number): Promise<T> {
    this.running = true;
    const result = job();
    // Kept alive (and off hibernation) until the queue drains.
    void this.keepAliveWhile(async () => {
      try {
        const value = await result;
        if (this.owed && this.thread.lastUserSeq() > sinceSeq(value)) {
          this.owed = false;
          await this.turn();
        }
        while (this.owed && this.thread.awaitingReply()) {
          this.owed = false;
          await this.turn();
        }
      } catch (error) {
        console.error("Tibo's turn queue failed", error);
      } finally {
        this.running = false;
        // Fold the new messages into memory soon, off the reply's path.
        await this.scheduleMemoryJobs(MEMORY_JOB_DELAY_S, "turn").catch((error: unknown) =>
          console.error("Scheduling memory jobs failed", error),
        );
      }
    });
    return result;
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

      // 3. The context, built fresh, with the user's day as it is now, and
      // what Tibo remembers that bears on what the user just said.
      const now = new Date();
      const today = dayIn(profile.timeZone, now);
      this.memory.set("time_zone", profile.timeZone);
      this.memory.set("first_name", profile.firstName);
      // The zone moved and the event saying so hasn't arrived yet: the
      // check-ins follow it now.
      const plan = this.proactive.get("proactive_plan");
      if (plan !== null && (JSON.parse(plan) as { timeZone?: string }).timeZone !== profile.timeZone) {
        void this.planProactive().catch((error: unknown) => console.error("Re-planning check-ins failed", error));
      }
      const recent = this.thread.latest(RECENT_WINDOW).messages;
      // Tibo may react to the newest thing the user said.
      const latestUserMessage = recent.findLast((message) => message.role === "user");
      const recall: RecallContext = {
        env: this.env,
        userId,
        store: this.memory,
        thread: this.thread,
        timeZone: profile.timeZone,
        today,
      };
      const refs = new MemoryRefs();
      const [snapshot, memories] = await Promise.all([
        this.snapshot(today, profile.timeZone),
        recallMemories(recall, unansweredText(recent)),
      ]);
      const story = storySection(this.memory, today);
      const remembered = memoriesSection(memories, refs, profile.timeZone);
      const context = buildTurnContext({
        persona: PERSONA,
        profile,
        now,
        recent,
        sections: [snapshot, story, remembered].filter((section): section is ContextSection => section !== null),
      });

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
        memory: {
          search: (input) => searchConversation(recall, refs, input),
          // No receipts: a "Remembered: …" line under the chat read as
          // unnatural; Tibo says it in its own words, and Settings lists them.
          remember: async (input) =>
            (await remember(recall, refs, { ...input, sourceMessageId: latestUserMessage?.id ?? null })).answer,
          forget: async (input) => (await forget(recall, refs, input)).answer,
        },
        reminders: this.reminderTools(profile.timeZone, today),
      });
      if (this.dev) void this.logContextSizes(context, tools);

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
    tools: ToolSet,
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

  /** Development: the estimated tokens of each part of the context, to tune the budget. */
  private async logContextSizes(context: TurnContext, tools: ToolSet) {
    try {
      const schemas = await Promise.all(
        Object.entries(tools).map(async ([name, entry]) => ({
          name,
          description: entry.description,
          schema: await asSchema(entry.inputSchema).jsonSchema,
        })),
      );
      console.log("Tibo context tokens", { ...context.sizes, tools: estimateTokens(JSON.stringify(schemas)) });
    } catch (error) {
      console.error("Measuring the context failed", error);
    }
  }

  // ─── Acting on the user's data ───────────────────────────────────────────

  /** The today snapshot, or `null` (logged) if the domain couldn't answer. */
  private async snapshot(today: string, timeZone: string): Promise<ContextSection | null> {
    const board = await this.board(today);
    return board ? todaySnapshot({ ...board, timeZone }) : null;
  }

  /** The user's day and running session, or `null` (logged) if the domain couldn't answer. */
  private async board(today: string): Promise<{ day: DayJson; activeSession: SessionJson | null } | null> {
    try {
      const [day, active] = await Promise.all([
        this.env.DOMAIN.run(this.name, "GetDay", { date: today }),
        this.env.DOMAIN.run(this.name, "GetActiveSession", undefined),
      ]);
      if (!day.ok || !active.ok) {
        console.error("Today snapshot failed", day.ok ? null : day.error, active.ok ? null : active.error);
        return null;
      }
      return { day: day.value as DayJson, activeSession: active.value as SessionJson | null };
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

/** What the user wrote since Tibo last spoke (what memories are recalled for), at most 1,000 characters. */
function unansweredText(recent: readonly TiboMessage[]): string {
  const lastTibo = recent.findLastIndex((message) => message.role === "tibo");
  return recent
    .slice(lastTibo + 1)
    .filter((message) => message.role === "user")
    .map((message) => message.body)
    .join("\n")
    .slice(-1000);
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
  if (frame.type === "read") return { type: "read" };
  if (frame.type === "loadOlder" && typeof frame.beforeId === "string" && frame.beforeId.length <= 64) {
    return { type: "loadOlder", beforeId: frame.beforeId };
  }
  return null;
}

/**
 * `gate`, past the reasons in `bypass` (the dev route's; `all` passes
 * everything but a running turn). Empty in production.
 */
function gateWith(input: GateInput, bypass: ReadonlySet<SkipReason | "all">): SkipReason | null {
  let current = input;
  for (let round = 0; round < 10; round++) {
    const reason = gate(current);
    if (reason === null || reason === "busy" || !(bypass.has("all") || bypass.has(reason))) return reason;
    const relaxed: Partial<Record<SkipReason, Partial<GateInput>>> = {
      off: { settings: { ...current.settings, enabled: true } },
      kind_off: {
        settings: { ...current.settings, morningPlan: true, deadlineNudges: true, habitCheck: true },
      },
      stale: { at: current.now },
      dormant: { lastSeenAt: current.now },
      quiet: { lastMessageAt: null },
    };
    current = { ...current, ...relaxed[reason] };
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

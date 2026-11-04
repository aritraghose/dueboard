/// <reference types="@cloudflare/workers-types" />

import { Agent, getAgentByName, type Connection, type ConnectionContext, type WSMessage } from "agents";
import { asSchema, generateText, isStepCount, streamText, type ToolSet } from "ai";
import type { AgentEnv } from "../AgentWorker.ts";
import { RELAY_UNITS_PER_SIDE } from "../domain/relay-constants.ts";
import { AI_UNITS_PER_MESSAGE } from "../domain/usage-constants.ts";
import {
  relayClient,
  tiboClient,
  usageClient,
  type RelayJson,
  type TiboEventJson,
  type TiboProactiveContext,
} from "../domain-client.ts";
import { MAX_CHAT_MESSAGE_LENGTH } from "../limits.ts";
import { MAX_TOOL_STEPS, PendingActions, TurnLedger, receiptFor, type PendingAction } from "./actions.ts";
import { Activity, ActivityLog } from "./activity.ts";
import { memoryRunDetail, thinkingDetail, toolLabel } from "./activity-rules.ts";
import {
  TIBO_STORAGE_MAX_BYTES,
  TIBO_UPLOADS_PER_DAY,
  TURN_FILE_MAX_BYTES,
  TURN_FILE_TEXT_MAX_LENGTH,
  cleanFileName,
  serveHeaders,
} from "./attachment-rules.ts";
import { AttachmentStore, fileContent } from "./attachments.ts";
import { BUBBLE_DELIMITER, BubbleSplitter, reactionLine, reactionOf, typingDelayMs } from "./bubbles.ts";
import { RECENT_WINDOW, buildTurnContext, withFiles, type ContextSection, type TurnContext } from "./context.ts";
import { addDays, dayIn, instantIn, startOfDayIn } from "./dates.ts";
import { devSeedThread } from "./dev-seed.ts";
import { MemoryJobs, type JobContext } from "./memory-jobs.ts";
import { MemoryStore } from "./memory.ts";
import { DAILY_JOB_CAP, DEV_DAILY_JOB_CAP, SETTLE_MS, estimateTokens } from "./memory-rules.ts";
import { IMAGE_SHAPES, museImage, type ImageReference, type ImageShape } from "../muse-image.ts";
import { IMAGE_REFUSAL_TEXT, IMAGE_UNITS, imageFileName, imageRef, imageRefusal, parseImageRef } from "./image-rules.ts";
import { MODEL, logMuseUsage, museOptions, museSpark } from "../muse.ts";
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
  TIBO_ACTIVITY_PAGE,
  TIBO_ACTIVITY_PATH,
  TIBO_FILE_MAX_BYTES,
  TIBO_FILES_PATH,
  TIBO_MEDIA_LIMIT,
  TIBO_HISTORY_PAGE,
  TIBO_MAX_ATTACHMENTS,
  TIBO_MAX_BUBBLES,
  TIBO_MEMORIES_LIMIT,
  TIBO_MEMORIES_PATH,
  TIBO_OLDER_PAGE,
  type TiboMemory,
  type TiboAttachment,
  type TiboClientFrame,
  type TiboConfirm,
  type TiboMessage,
  type TiboReceipt,
  type TiboServerFrame,
  type TiboUpload,
} from "./protocol.ts";
import {
  RelayCards,
  cardOf,
  deliveryFallback,
  deliverySection,
  expiredLine,
  outcomeEventBody,
  outcomeFallback,
  outcomeSection,
  ownWords,
  receivedEventBody,
  relayListView,
  sentEventBody,
} from "./relays.ts";
import { todaySnapshot } from "./snapshot.ts";
import { Thread, type MessageMeta } from "./thread.ts";
import { tiboTools, type RelayTools } from "./tools.ts";
import type { DayJson, SessionJson } from "./views.ts";

const ERROR_BUBBLES = {
  model: "Okay, my brain just blue-screened. Nothing got sent, nothing got charged. Try me again in a sec?",
  rateLimit: "Whoa, you're typing faster than I can think, and I think FAST. Give me a minute, then hit me again.",
} as const;

const QUIET_BUBBLES = {
  done: "Done!",
  held: "Just need your go-ahead on this one.",
  capped: "That's as much as I can do in one go. Want me to keep going?",
} as const;

const FRAME_BUDGET = 60;
const FRAME_WINDOW_MS = 10_000;

const MAX_CLIENT_ID_LENGTH = 64;

const MEMORY_JOB_DELAY_S = 60;
const MEMORY_JOB_CONTINUE_S = 5;
const DAY_END_GRACE_MS = 5 * 60_000;

const RELAY_TURN_WINDOW = 12;
const RELAY_TURN_RETRY_S = 10;

interface RelayTurn {
  readonly relayId: string;
  readonly kind: "deliver" | "outcome" | "expired";
}

interface CheckInTrigger {
  readonly id: string;
  readonly kind: ProactiveKind;
  readonly day: string;
  readonly at: number;
}

export class TiboAgent extends Agent<AgentEnv> {
  private threadStore: Thread | undefined;
  private actionStore: PendingActions | undefined;
  private memoryStore: MemoryStore | undefined;
  private proactiveStore: ProactiveStore | undefined;
  private reminderStore: ReminderStore | undefined;
  private relayCardStore: RelayCards | undefined;
  private attachmentStore: AttachmentStore | undefined;
  private activityStore: ActivityLog | undefined;
  private frameCounts = new Map<string, { windowStart: number; count: number }>();
  private memoryJobRunning = false;
  private memoryJobOwed = false;
  private readonly freshMemories: JobContext["fresh"] = [];
  private running = false;
  private owed = false;

  private get thread() {
    if (!this.threadStore) {
      this.threadStore = new Thread(this.ctx.storage.sql);
      this.threadStore.migrate();
    }
    return this.threadStore;
  }

  private get actions() {
    if (!this.actionStore) {
      this.actionStore = new PendingActions(this.ctx.storage.sql);
      this.actionStore.migrate();
    }
    return this.actionStore;
  }

  private get memory() {
    if (!this.memoryStore) {
      this.memoryStore = new MemoryStore(this.ctx.storage.sql);
      this.memoryStore.migrate();
    }
    return this.memoryStore;
  }

  private get proactive() {
    if (!this.proactiveStore) {
      this.proactiveStore = new ProactiveStore(this.ctx.storage.sql);
      this.proactiveStore.migrate();
    }
    return this.proactiveStore;
  }

  private get reminders() {
    if (!this.reminderStore) {
      this.reminderStore = new ReminderStore(this.ctx.storage.sql);
      this.reminderStore.migrate();
    }
    return this.reminderStore;
  }

  private get cards() {
    if (!this.relayCardStore) {
      this.relayCardStore = new RelayCards(this.ctx.storage.sql);
      this.relayCardStore.migrate();
    }
    return this.relayCardStore;
  }

  private get files() {
    if (!this.attachmentStore) {
      this.attachmentStore = new AttachmentStore(this.ctx.storage.sql, this.env.TIBO_FILES, this.name);
      this.attachmentStore.migrate();
    }
    return this.attachmentStore;
  }

  private get activity() {
    if (!this.activityStore) {
      this.activityStore = new ActivityLog(this.ctx.storage.sql, (activity) => this.send({ type: "activity", activity }));
      this.activityStore.migrate();
    }
    return this.activityStore;
  }

  private get dev() {
    return this.env.TIBO_DEV === "true";
  }

  onStart() {
    void this.thread;
    void this.actions;
    void this.memory;
    void this.reminders;
    void this.cards;
    void this.files;
    this.activity.interruptRunning();
    this.activity.prune(Date.now());
    this.proactive.prune(Date.now());
    void this.files.pruneOrphans(Date.now()).catch((error: unknown) => console.error("Pruning unsent files failed", error));
  }

  validateStateChange(_next: unknown, source: Connection | "server") {
    if (source !== "server") throw new Error("Read-only");
  }

  onConnect(connection: Connection, _ctx: ConnectionContext) {
    this.proactive.set("last_seen_at", Date.now());
    let readSeq = this.proactive.getNumber("read_seq");
    if (readSeq === null) {
      readSeq = this.thread.lastSeq();
      this.proactive.set("read_seq", readSeq);
    }
    const { messages, hasMore } = this.thread.latest(TIBO_HISTORY_PAGE);
    this.sendTo(connection, {
      type: "history",
      messages,
      hasMore,
      unread: this.thread.tiboAfter(readSeq),
      activity: this.activity.running(),
    });
    if (this.proactive.get("proactive_plan") === null) {
      void this.planProactive().catch((error: unknown) => console.error("Planning check-ins failed", error));
    }
  }

  onMessage(connection: Connection, raw: WSMessage) {
    if (!this.allowFrame(connection.id)) return;
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
      if (frame.emoji !== null && reactionOf(reactionLine(frame.emoji)) === null) return;
      const message = this.thread.react(frame.messageId, "tibo", frame.emoji);
      if (message) this.send({ type: "reaction", messageId: message.id, emoji: frame.emoji });
      return;
    }

    const text = frame.text.trim();
    const unsent = this.files.unsent(frame.attachments ?? []);
    if (!text && unsent.length === 0) return;
    if (text.length > MAX_CHAT_MESSAGE_LENGTH) {
      this.sendTo(connection, {
        type: "error",
        message: `Messages can be up to ${MAX_CHAT_MESSAGE_LENGTH} characters.`,
      });
      return;
    }
    const replyTo = frame.replyTo ? this.thread.quote(frame.replyTo) : null;
    const messageId = crypto.randomUUID();
    const attachments: TiboAttachment[] = unsent.length > 0 ? this.files.claim(unsent.map((file) => file.id), messageId) : [];
    const message = this.thread.add({
      id: messageId,
      role: "user",
      body: text,
      meta: {
        clientId: frame.clientId,
        ...(replyTo ? { replyTo } : {}),
        ...(attachments.length > 0 ? { attachments } : {}),
      },
    });
    this.send({ type: "bubble", message });
    this.proactive.set("last_seen_at", Date.now());
    this.requestTurn();
  }

  onClose(connection: Connection) {
    this.frameCounts.delete(connection.id);
  }

  private allowFrame(connectionId: string) {
    const now = Date.now();
    const current = this.frameCounts.get(connectionId);
    if (!current || now - current.windowStart >= FRAME_WINDOW_MS) {
      this.frameCounts.set(connectionId, { windowStart: now, count: 1 });
      return true;
    }
    current.count += 1;
    return current.count <= FRAME_BUDGET;
  }

  async wipe() {
    for (const connection of this.getConnections()) connection.close(4000, "Account deleted");
    await this.deleteAllVectors();
    await this.files.deleteAll();
    await this.destroy();
  }

  private async deleteAllVectors() {
    const ids = this.memory.allVectorIds();
    for (let start = 0; start < ids.length; start += 500) {
      await this.env.MEMORY.deleteByIds(ids.slice(start, start + 500));
    }
  }

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
    if (route[0] === TIBO_FILES_PATH && route.length === 1 && request.method === "POST") return this.upload(request);
    if (route[0] === TIBO_FILES_PATH && route.length === 1 && request.method === "GET") {
      return Response.json({ files: this.files.sent(TIBO_MEDIA_LIMIT) });
    }
    if (route[0] === TIBO_ACTIVITY_PATH && route.length === 1 && request.method === "GET") {
      const before = Number(new URL(request.url).searchParams.get("before"));
      return Response.json(
        this.activity.page(Number.isFinite(before) && before > 0 ? before : Date.now() + 1, TIBO_ACTIVITY_PAGE),
      );
    }
    if (route[0] === TIBO_FILES_PATH && route.length === 2 && (request.method === "GET" || request.method === "HEAD")) {
      return this.serveFile(route[1]!, new URL(request.url).searchParams.has("download"), request.method === "HEAD");
    }
    if (route[0] === "dev" && this.dev) return this.devRoute(route[1], request);
    return new Response("Not found", { status: 404 });
  }

  private async upload(request: Request): Promise<Response> {
    const answer = (body: TiboUpload, status = 200) => Response.json(body, { status });
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength === 0) return answer({ ok: false, error: "empty" }, 400);
    if (bytes.byteLength > TIBO_FILE_MAX_BYTES) return answer({ ok: false, error: "too_large" }, 413);
    const now = Date.now();
    await this.files.pruneOrphans(now).catch((error: unknown) => console.error("Pruning unsent files failed", error));
    const usage = this.files.usage(now - 24 * 60 * 60 * 1000);
    if (usage.uploads >= TIBO_UPLOADS_PER_DAY) return answer({ ok: false, error: "daily_limit" }, 429);
    if (usage.bytes + bytes.byteLength > TIBO_STORAGE_MAX_BYTES) return answer({ ok: false, error: "storage_full" }, 507);
    try {
      const attachment = await this.files.create(cleanFileName(request.headers.get("x-file-name")), bytes, (name, file) =>
        this.readDocument(name, file),
      );
      return answer({ ok: true, attachment });
    } catch (error) {
      console.error("Storing a file failed", error);
      return answer({ ok: false, error: "failed" }, 500);
    }
  }

  private async readDocument(name: string, bytes: Uint8Array<ArrayBuffer>): Promise<string | null> {
    const activity = this.activity.start({ kind: "file", label: `Reading ${name}` });
    try {
      const result = await this.env.AI.toMarkdown(
        { name, blob: new Blob([bytes]) },
        { conversionOptions: { pdf: { metadata: false, images: { convert: false } } } },
      );
      activity.end(result.format === "error" ? "failed" : "done");
      return result.format === "error" ? null : result.data;
    } catch (error) {
      console.error("Reading a document failed", error);
      activity.end("failed");
      return null;
    }
  }

  private async serveFile(id: string, download: boolean, head: boolean): Promise<Response> {
    const stored = id.length <= 64 ? this.files.get(id) : null;
    if (!stored) return new Response("Not found", { status: 404 });
    const object = head ? null : await this.files.object(id);
    if (!head && !object) return new Response("Not found", { status: 404 });
    return new Response(object?.body ?? null, { headers: serveHeaders(stored.attachment, download) });
  }

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
    if (action === "muse-probe" && request.method === "POST") return this.devMuseProbe(request);
    if (action === "image" && request.method === "POST") return this.devImage(request);
    if (action === "check-in" && request.method === "POST") return this.devCheckIn(request);
    if (action === "check-ins" && request.method === "GET") return this.devCheckIns();
    if (action === "alarm" && request.method === "POST") return this.devAlarm(request);
    if (action === "relay-expire" && request.method === "POST") {
      const relayId = new URL(request.url).searchParams.get("id") ?? "";
      const result = await relayClient(this.env.DOMAIN, this.name).expireNow(relayId);
      return Response.json(result, { status: result.ok ? 200 : 404 });
    }
    if (action === "peer") return this.devPeer(request);
    if (action === "relays" && request.method === "GET") {
      const result = await relayClient(this.env.DOMAIN, this.name).list();
      return Response.json(result);
    }
    if (action === "memory-jobs" && request.method === "POST") {
      await this.scheduleMemoryJobs(1, "dev");
      return Response.json({ scheduled: true });
    }
    if (action === "memory" && request.method === "GET") {
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

  private async devMuseProbe(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const effort = url.searchParams.get("effort") ?? "default";
    const question = url.searchParams.get("q") ?? "what should I focus on this afternoon? I have a report due friday and haven't gone to the gym in a week";
    const started = Date.now();
    const result = await generateText({
      model: museSpark(this.env, this.name),
      system: PERSONA,
      prompt: question,
      providerOptions:
        effort === "default"
          ? {}
          : {
              openai: {
                forceReasoning: true,
                systemMessageMode: "system",
                reasoningEffort: effort,
                reasoningSummary: url.searchParams.has("summary") ? "auto" : null,
              },
            },
      abortSignal: AbortSignal.timeout(120_000),
    }).catch((error: unknown) => error as Error & { responseBody?: string; requestBodyValues?: unknown });
    if (result instanceof Error) {
      return Response.json(
        { effort, error: result.message, responseBody: result.responseBody, request: result.requestBodyValues },
        { status: 502 },
      );
    }
    const raw = result.response.body as { output?: { type: string; summary?: unknown }[] } | undefined;
    return Response.json({
      effort,
      ms: Date.now() - started,
      usage: result.usage,
      reasoning: result.reasoningText ?? null,
      reasoningItems: raw?.output?.filter((item) => item.type === "reasoning") ?? null,
      text: result.text,
      warnings: result.warnings,
    });
  }

  private async devImage(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const prompt = url.searchParams.get("prompt") ?? "a small orange cat napping in a sunbeam on a wooden desk, soft watercolor";
    const shape = (url.searchParams.get("shape") ?? "square") as ImageShape;
    const from = url.searchParams.get("from");
    const stored = from ? this.files.get(from) : null;
    const bytes = from ? await this.files.bytes(from) : null;
    if (from && (!stored || !bytes)) return Response.json({ error: "No such file" }, { status: 404 });
    const result = await museImage(this.env, this.name, {
      prompt,
      shape: IMAGE_SHAPES.includes(shape) ? shape : "square",
      references: stored && bytes ? [{ mediaType: stored.attachment.mediaType, bytes }] : [],
    });
    if (!result.ok) return Response.json(result, { status: 502 });
    return new Response(result.bytes, { headers: { "content-type": result.mediaType, "x-ms": String(result.ms) } });
  }

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

  private async devPeer(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const userId = url.searchParams.get("user") ?? "";
    if (!userId || userId === this.name) return Response.json({ error: "user is another account's id" }, { status: 400 });
    const peer = await getAgentByName(this.env.TiboAgent as unknown as DurableObjectNamespace<TiboAgent>, userId);
    if (request.method === "GET") return Response.json(await peer.devThread());
    const what = url.searchParams.get("do");
    if (what === "say") return Response.json(await peer.devSay(url.searchParams.get("text") ?? ""));
    if (what === "confirm") return Response.json(await peer.devConfirm(url.searchParams.get("approve") === "true"));
    return Response.json({ error: "do is say or confirm" }, { status: 400 });
  }

  async devThread() {
    if (!this.dev) throw new Error("Development only");
    return {
      messages: this.thread.latest(20).messages.map(({ role, body, relay, confirm }) => ({ role, body, relay, confirm })),
      pending: this.actions.current(Date.now()),
      usage: await usageClient(this.env.DOMAIN)
        .get(this.name)
        .catch(() => null),
    };
  }

  async devSay(text: string) {
    if (!this.dev) throw new Error("Development only");
    const message = this.thread.add({ role: "user", body: text.slice(0, MAX_CHAT_MESSAGE_LENGTH), meta: { clientId: crypto.randomUUID() } });
    this.send({ type: "bubble", message });
    this.requestTurn();
    return { ok: true };
  }

  async devConfirm(approve: boolean) {
    if (!this.dev) throw new Error("Development only");
    const pending = this.actions.current(Date.now());
    if (!pending) return { error: "Nothing is waiting." };
    return this.answerPending(pending.id, approve);
  }

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

  private async scheduleMemoryJobs(delaySeconds: number, reason: string) {
    const at = Date.now() + delaySeconds * 1000;
    await this.schedule(new Date(at), "runMemoryJobs", { reason, minute: Math.floor(at / 60_000) }, { idempotent: true });
  }

  async runMemoryJobs(_payload?: { reason: string; minute: number }) {
    if (this.memoryJobRunning) {
      this.memoryJobOwed = true;
      return;
    }
    this.memoryJobRunning = true;
    await this.scheduleMemoryJobs(15 * 60, "watchdog");
    void this.keepAliveWhile(() => this.memoryJobRun());
  }

  private async memoryJobRun() {
    let memoryAct: Activity | undefined;
    let memoryStep: Activity | undefined;
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
      const before = this.memory.stats();
      const progress = (label: string) => {
        memoryAct ??= this.activity.start({ kind: "memory", label: "Tidying up my memory" });
        memoryStep?.end();
        memoryStep = memoryAct.step("step", label);
      };
      const outcome = await new MemoryJobs({
        env: this.env,
        userId: this.name,
        store: this.memory,
        thread: this.thread,
        files: this.files,
        timeZone,
        firstName: profile?.firstName ?? this.memory.get("first_name") ?? "the user",
        now,
        cap: this.dev ? DEV_DAILY_JOB_CAP : DAILY_JOB_CAP,
        fresh: this.freshMemories,
        log: this.dev ? (...args) => console.log("Tibo memory job:", ...args) : () => {},
        progress,
      }).run();
      memoryStep?.end();
      if (memoryAct) {
        const after = this.memory.stats();
        const summaries = (stats: typeof after) => Object.values(stats.summaries).reduce((sum, n) => sum + n, 0);
        memoryAct.end(
          "done",
          memoryRunDetail({
            memories: Math.max(after.memories - before.memories, 0),
            files: outcome.filesNoted,
            summaries: Math.max(summaries(after) - summaries(before), 0),
          }) ?? "Nothing new to keep",
        );
      }
      if (this.dev) console.log("Tibo memory job", this.name, outcome, this.memory.stats());

      const tomorrow = startOfDayIn(timeZone, addDays(dayIn(timeZone, now), 1)) + DAY_END_GRACE_MS;
      if (outcome.outOfBudget) {
        await this.scheduleMemoryJobs((tomorrow - Date.now()) / 1000, "budget");
      } else if (outcome.more || this.memoryJobOwed) {
        await this.scheduleMemoryJobs(MEMORY_JOB_CONTINUE_S, "continue");
      } else if (this.thread.countAfter(this.memory.getNumber("summarized_seq")) > 0) {
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
      memoryAct?.end("failed");
      await this.scheduleMemoryJobs(10 * 60, "retry");
    } finally {
      this.memoryJobRunning = false;
      this.memoryJobOwed = false;
    }
  }

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
          :
            nextSlot(kind, context.timeZone, time, now, PLAN_GRACE_MS),
      );
    }
    this.proactive.set("proactive_plan", planFingerprint(context.proactive, context.timeZone));
    if (this.dev) console.log("Tibo check-ins planned", this.name, await this.armedSlots());
  }

  private armSlot(slot: ProactiveSlot) {
    return this.schedule(new Date(slot.at), "proactiveFire", slot, { idempotent: true });
  }

  private async armedSlots() {
    return (await this.listSchedules())
      .filter((schedule) => schedule.callback === "proactiveFire")
      .map((schedule) => ({ ...(schedule.payload as ProactiveSlot), firesAt: new Date(schedule.time * 1000).toISOString() }));
  }

  async proactiveFire(slot: ProactiveSlot, schedule?: { id: string }) {
    void this.keepAliveWhile(() =>
      this.runSlot(slot, schedule?.id ?? "").catch((error: unknown) => console.error("Tibo check-in alarm failed", slot, error)),
    );
  }

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
      console.error("Reading check-in settings failed", error);
      await this.schedule(5 * 60, "replanProactive", { retry: true }, { idempotent: true });
      return;
    }
    if (this.proactive.get("proactive_plan") !== planFingerprint(context.proactive, context.timeZone)) {
      await this.planProactive(context, { slot, scheduleId });
    } else {
      const time = slotTime(slot.kind, context.proactive);
      if (time) await this.armSlot(nextSlot(slot.kind, context.timeZone, time, Math.max(Date.now(), slot.at)));
    }
    if (!slot.dev && !slotStillPlanned(slot, context.proactive, context.timeZone)) return;
    const id = slot.dev ? `dev:${slot.kind}:${slot.at}` : `${slot.kind}:${slot.day}`;
    await this.checkIn({ id, kind: slot.kind, day: slot.day, at: slot.at }, context);
  }

  async deliverEvents(events: readonly TiboEventJson[]) {
    if (events.some((event) => event.kind === "settings_changed")) await this.planProactive();
    return { ok: true as const };
  }

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
    const { allowed } = await usageClient(this.env.DOMAIN)
      .check(this.name, AI_UNITS_PER_MESSAGE)
      .catch(() => ({ allowed: false }));
    if (!allowed) return skip("quota");
    if (this.running) return skip("busy");
    const { outcome } = await this.exclusive(
      () => this.checkInTurn(trigger, context, focus, board),
      ({ eventSeq }) => eventSeq,
    );
    return outcome;
  }

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
    const act = this.activity.start({ kind: "check_in", label: CHECK_IN_LABEL[trigger.kind] });
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
      await this.reply(turnId, turnContext, null, {}, new TurnLedger(), act);
      act.end();
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
      act.end("failed");
      this.thread.remove(event.id);
      this.proactive.finish(trigger.id, "failed");
      return { outcome: "failed", eventSeq };
    } finally {
      this.send({ type: "turnDone", turnId });
    }
  }

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
        const reminder = this.reminders.settle(id, "cancelled");
        if (!reminder) return { error: "No reminder to come has that id. List them first." };
        return { status: "done", cancelled: reminder.about };
      },
    };
  }

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
    this.thread.add({
      role: "system_event",
      body: `A reminder the user asked for came due (${reminder.about}); it was sent as written.`,
      turnId,
      meta: { reminder: reminder.id },
    });
    const act = this.activity.start({ kind: "reminder", label: "Sending a reminder you asked for", detail: reminder.about });
    this.send({ type: "typing", on: true });
    await sleep(typingDelayMs(reminder.message));
    const message = this.thread.add({ role: "tibo", body: reminder.message, turnId, meta: { reminder: reminder.id } });
    act.end();
    this.send({ type: "typing", on: false });
    this.send({ type: "bubble", message });
    this.send({ type: "turnDone", turnId });
    await this.notifyUser({ kind: "reminder", turnId });
    if (this.dev) console.log("Tibo reminder sent", reminder.id);
  }

  private async notifyUser(_note: { kind: ProactiveKind | "reminder" | "relay"; turnId: string }) {}

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

  private exclusive<T>(job: () => Promise<T>, sinceSeq: (value: T) => number): Promise<T> {
    this.running = true;
    const result = job();
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
    const act = this.activity.start({ kind: "reply", label: "Replying to you" });
    const reading = act.step("reading", "Reading your message");
    try {
      const { success } = await this.env.CHAT_RATE_LIMIT.limit({ key: userId });
      if (!success) {
        this.send({
          type: "error",
          message: "Too many messages. Please wait a minute and try again.",
          bubble: ERROR_BUBBLES.rateLimit,
        });
        act.end("skipped", "Too many messages at once");
        return;
      }
      const [{ allowed, usage: current }, profile] = await Promise.all([
        usage.check(userId, AI_UNITS_PER_MESSAGE),
        tiboClient(this.env.DOMAIN).profile(userId),
      ]);
      if (!allowed) {
        this.send({ type: "limitReached", limit: current.limit });
        this.send({ type: "usage", remaining: current.remaining, limit: current.limit });
        act.end("skipped", "No messages left this month");
        return;
      }

      const seen = this.thread.markSeen();
      if (seen.length > 0) this.send({ type: "seen", messageIds: seen });
      if (seen.length > 1) reading.set({ label: `Reading your ${seen.length} messages` });
      reading.end();

      const now = new Date();
      const today = dayIn(profile.timeZone, now);
      this.memory.set("time_zone", profile.timeZone);
      this.memory.set("first_name", profile.firstName);
      const plan = this.proactive.get("proactive_plan");
      if (plan !== null && (JSON.parse(plan) as { timeZone?: string }).timeZone !== profile.timeZone) {
        void this.planProactive().catch((error: unknown) => console.error("Re-planning check-ins failed", error));
      }
      const recent = this.thread.latest(RECENT_WINDOW).messages;
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
      const gathering = act.step("context", "Checking your day and what I remember");
      const [snapshot, memories] = await Promise.all([
        this.snapshot(today, profile.timeZone),
        recallMemories(recall, unansweredText(recent)),
      ]);
      gathering.end("done", memories.length > 0 ? `Recalled ${memories.length} ${memories.length === 1 ? "memory" : "memories"}` : undefined);
      const story = storySection(this.memory, today);
      const remembered = memoriesSection(memories, refs, profile.timeZone);
      const built = buildTurnContext({
        persona: PERSONA,
        profile,
        now,
        recent,
        sections: [snapshot, story, remembered].filter((section): section is ContextSection => section !== null),
        fileNote: (id) => this.files.notes([id]).get(id)?.note ?? null,
      });
      const context = { ...built, messages: withFiles(built.messages, await this.newFiles(recent, act)) };

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
          remember: async (input) =>
            (await remember(recall, refs, { ...input, sourceMessageId: latestUserMessage?.id ?? null })).answer,
          forget: async (input) => (await forget(recall, refs, input)).answer,
        },
        reminders: this.reminderTools(profile.timeZone, today),
        relays: this.relayTools(unansweredText(recent)),
        images: { make: (input) => this.makeImage(ledger, input) },
      });
      if (this.dev) void this.logContextSizes(context, tools);

      const answered = await this.reply(turnId, context, latestUserMessage?.id ?? null, tools, ledger, act);

      if (answered) {
        const after = await usage
          .record(userId, AI_UNITS_PER_MESSAGE, "tibo_reply", turnId)
          .catch((error: unknown) => {
            console.error("Recording AI usage failed", error);
            return null;
          });
        if (after) this.send({ type: "usage", remaining: after.remaining, limit: after.limit });
      }
      act.end("done", turnDetail(ledger));
    } catch (error) {
      console.error("Tibo turn failed", error);
      this.send({ type: "typing", on: false });
      this.send({ type: "error", message: "Tibo couldn't reply.", bubble: ERROR_BUBBLES.model });
      act.end("failed", "Couldn't reply");
    } finally {
      this.send({ type: "turnDone", turnId });
    }
  }

  private async reply(
    turnId: string,
    context: TurnContext,
    reactTo: string | null,
    tools: ToolSet,
    ledger: TurnLedger,
    act?: Activity,
  ): Promise<boolean> {
    const bubbles = new Channel<string | { picture: TiboAttachment }>();
    let picturesShown = 0;
    const showPictures = () => {
      if (picturesShown >= ledger.images.length) return;
      for (const bubble of splitter.push(`\n${BUBBLE_DELIMITER}\n`)) bubbles.put(bubble);
      for (const picture of ledger.images.slice(picturesShown)) bubbles.put({ picture });
      picturesShown = ledger.images.length;
    };
    let phase: { kind: "thinking" | "writing"; step: Activity } | null = null;
    const enter = (kind: "thinking" | "writing") => {
      if (!act || phase?.kind === kind) return;
      phase?.step.end();
      phase = { kind, step: act.step(kind, kind === "thinking" ? "Thinking" : "Writing a reply") };
    };
    const leave = () => {
      phase?.step.end();
      phase = null;
    };
    const noteThought = (summary: string) => {
      if (phase?.kind === "thinking" && summary.trim()) phase.step.set({ detail: thinkingDetail(summary) });
    };
    const toolSteps = new Map<string, { step: Activity; receipts: number; held: number }>();
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

    const result = streamText({
      model: museSpark(this.env, this.name),
      system: context.system,
      messages: context.messages,
      tools,
      stopWhen: isStepCount(MAX_TOOL_STEPS),
      providerOptions: museOptions("reply", { summary: act !== undefined }),
    });
    let capped = false;
    let step = 0;
    let stepStarted = Date.now();
    let thought = "";
    const produce = (async () => {
      for await (const part of result.fullStream) {
        if (part.type === "error") throw part.error;
        if (part.type === "start-step") {
          step += 1;
          stepStarted = Date.now();
          thought = "";
          enter("thinking");
        }
        if (part.type === "reasoning-delta") thought += part.text;
        if (part.type === "reasoning-end") noteThought(thought);
        if (part.type === "tool-call" && part.toolName === "make_image") {
          for (const bubble of splitter.push(`\n${BUBBLE_DELIMITER}\n`)) bubbles.put(bubble);
        }
        if (part.type === "tool-call" && act) {
          leave();
          toolSteps.set(part.toolCallId, {
            step: act.step("tool", toolLabel(part.toolName)),
            receipts: ledger.receipts.length,
            held: ledger.held.length,
          });
        }
        if (part.type === "tool-result" || part.type === "tool-error") {
          const tool = toolSteps.get(part.toolCallId);
          toolSteps.delete(part.toolCallId);
          if (tool && part.type === "tool-error") tool.step.end("failed");
          else if (tool) {
            const made = ledger.receipts.slice(tool.receipts).map((receipt) => receipt.text);
            const held = ledger.held.length > tool.held ? ["Waiting for your go-ahead"] : [];
            tool.step.end("done", [...made, ...held].join("; ") || undefined);
          }
          showPictures();
        }
        if (part.type === "text-delta") {
          enter("writing");
          for (const bubble of splitter.push(part.text)) bubbles.put(bubble);
          takeReaction();
        }
        if (part.type === "finish-step") {
          logMuseUsage("reply", part.usage, Date.now() - stepStarted, step);
          for (const bubble of splitter.push(`\n${BUBBLE_DELIMITER}\n`)) bubbles.put(bubble);
          capped = part.finishReason === "tool-calls";
        }
      }
      showPictures();
      for (const bubble of splitter.finish()) bubbles.put(bubble);
      takeReaction();
      if (capped) bubbles.put(QUIET_BUBBLES.capped);
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
        const picture = typeof next.value === "string" ? null : next.value.picture;
        const wait = picture ? 0 : typingDelayMs(next.value as string) - (Date.now() - typingSince);
        if (wait > 0) await sleep(wait);
        const messageId = crypto.randomUUID();
        const attachments = picture ? this.files.claim([picture.id], messageId) : [];
        const message = this.thread.add({
          id: messageId,
          role: "tibo",
          body: picture ? "" : (next.value as string),
          turnId,
          meta: { model: MODEL, ...(attachments.length > 0 ? { attachments } : {}) },
        });
        delivered += 1;
        lastBubbleId = message.id;
        this.send({ type: "bubble", message });
        typingSince = Date.now();
        if (!bubbles.drained) this.send({ type: "typing", on: true });
      }
    } finally {
      this.send({ type: "typing", on: false });
      await produce;
      leave();
      for (const tool of toolSteps.values()) tool.step.end("failed");
    }
  }

  private async makeImage(
    ledger: TurnLedger,
    input: { prompt: string; from: readonly string[]; shape: ImageShape },
  ): Promise<unknown> {
    const userId = this.name;
    const now = Date.now();
    const refusal = imageRefusal({
      madeThisTurn: ledger.images.length,
      madeToday: this.files.madeSince(now - 24 * 60 * 60 * 1000),
      storedBytes: this.files.usage(now).bytes,
      storageMaxBytes: TIBO_STORAGE_MAX_BYTES,
    });
    if (refusal) return { error: IMAGE_REFUSAL_TEXT[refusal] };

    const references: ImageReference[] = [];
    for (const raw of input.from) {
      const ref = parseImageRef(raw);
      const stored = ref ? this.files.findImage(ref) : null;
      const bytes = stored ? await this.files.bytes(stored.attachment.id) : null;
      if (!stored || !bytes) return { error: IMAGE_REFUSAL_TEXT.unknown_image, ref: raw };
      references.push({ mediaType: stored.attachment.mediaType, bytes });
    }

    const usage = usageClient(this.env.DOMAIN);
    const { allowed } = await usage.check(userId, AI_UNITS_PER_MESSAGE + IMAGE_UNITS);
    if (!allowed) return { error: IMAGE_REFUSAL_TEXT.no_quota };

    const result = await museImage(this.env, userId, { prompt: input.prompt, references, shape: input.shape });
    if (!result.ok) {
      console.error("Muse image failed", result.reason, result.detail);
      return { error: IMAGE_REFUSAL_TEXT[result.reason] };
    }
    const attachment = await this.files.createMade(
      imageFileName(input.prompt, result.mediaType),
      result.bytes,
      input.prompt,
      references.length > 0,
    );
    await usage.record(userId, IMAGE_UNITS, "tibo_image", attachment.id).catch((error: unknown) => {
      console.error("Recording image usage failed", error);
    });
    ledger.images.push(attachment);
    return {
      ok: true,
      ref: imageRef(attachment.id),
      note: "The picture shows in the chat right after what you've said so far. Don't describe it at length or write its ref; a short line about it is plenty.",
    };
  }

  private async newFiles(recent: readonly TiboMessage[], act?: Activity) {
    const lastTibo = recent.findLastIndex((message) => message.role === "tibo");
    const attachments = recent
      .slice(lastTibo + 1)
      .filter((message) => message.role === "user")
      .flatMap((message) => message.attachments ?? []);
    if (attachments.length === 0) return [];
    const step = act?.step(
      "file",
      attachments.length === 1 ? `Opening ${attachments[0]!.name}` : `Opening your ${attachments.length} files`,
    );
    try {
      const parts = await fileContent(this.files, attachments, { bytes: TURN_FILE_MAX_BYTES, text: TURN_FILE_TEXT_MAX_LENGTH });
      step?.end();
      return parts;
    } catch (error) {
      step?.end("failed");
      throw error;
    }
  }

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

  private async snapshot(today: string, timeZone: string): Promise<ContextSection | null> {
    const board = await this.board(today);
    return board ? todaySnapshot({ ...board, timeZone }) : null;
  }

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
      const message = this.thread.get(action.messageId);
      if (message) this.send({ type: "updated", message });
      return { error: "That was already answered." };
    }
    this.setConfirm(settled, approve ? "confirmed" : "cancelled");
    if (!approve) return { status: "cancelled", nothingChanged: true };

    const receipts: TiboReceipt[] = [];
    const changed = new Set<string>();
    const act = this.activity.start({ kind: "confirm", label: "Doing what you confirmed" });
    for (const call of settled.calls) {
      const step = act.step("tool", call.summary);
      const result = await this.env.DOMAIN.run(this.name, call.rpc, call.payload).catch((error: unknown) => {
        console.error("A held action failed", call.rpc, error);
        return { ok: false as const, error: { tag: "Unavailable", message: "Couldn't reach the app." } };
      });
      if (result.ok) {
        receipts.push(receiptFor(call, result.value));
        for (const key of call.keys) changed.add(key);
        step.end();
      } else {
        receipts.push({ text: `${call.summary}: ${result.error.message}`, failed: true });
        step.end("failed", result.error.message);
      }
    }
    act.end(receipts.some((receipt) => receipt.failed) ? "failed" : "done");
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

  private setMeta(messageId: string, key: "receipts" | "confirm" | "relay", value: unknown) {
    const message = this.thread.setMeta(messageId, key, value);
    if (message) this.send({ type: "updated", message });
  }

  private relayTools(unanswered: string): RelayTools {
    const relays = relayClient(this.env.DOMAIN, this.name);
    const failure = (error: { tag: string; message: string; details?: Record<string, unknown> }) => ({
      error: error.message,
      code: error.tag,
      ...(error.details?.candidates ? { candidates: error.details.candidates } : {}),
    });
    const notTheirs = (foreign: readonly string[]) => ({
      error: `Not sent: only the user's own words go to another person, and they didn't say ${foreign
        .slice(0, 6)
        .map((word) => `“${word}”`)
        .join(", ")}. Use their words, or ask them what to say.`,
      code: "NotUsersWords",
    });
    const answerable = (relayId: string) => {
      const card = this.cards.get(relayId);
      const shown = card ? this.thread.get(card.messageId)?.relay : undefined;
      if (!card || card.direction !== "in" || !shown) {
        return { error: "No message from someone else has that id. Use list_relays to find it." } as const;
      }
      if (card.status !== "delivered") {
        return { error: `That message from @${shown.person.username} isn't waiting for an answer any more (${card.status}).` } as const;
      }
      const since = this.thread
        .after(card.cardSeq, 200)
        .filter((message) => message.role === "user")
        .map((message) => message.body)
        .join("\n");
      if (!since) return { error: "The user hasn't said what to answer yet. Ask them first." } as const;
      return { username: shown.person.username, name: shown.person.name, since };
    };
    return {
      send: async (to, message) => {
        const target = await relays.check(to);
        if (!target.ok) return failure(target.error);
        const own = ownWords(message, `${unanswered}\n${target.value.username} ${target.value.name}`);
        if (!own.ok) return notTheirs(own.foreign);
        const sent = await relays.send(target.value.username, message);
        if (!sent.ok) return failure(sent.error);
        this.showSent(sent.value);
        this.reachPeer(sent.value);
        return {
          status: "done",
          to: `@${target.value.username}`,
          next: "Sent. Tell the user in a few words that you're on it (\"Okay, I'll ask them for you.\"); you'll tell them when the answer comes back.",
        };
      },
      answer: async (relayId, answer) => {
        const allowed = answerable(relayId);
        if ("error" in allowed) return allowed;
        const own = ownWords(answer, `${allowed.since}\n${allowed.username} ${allowed.name}`);
        if (!own.ok) return notTheirs(own.foreign);
        const result = await relays.answer(relayId, answer);
        if (!result.ok) {
          if (result.error.tag === "RelayClosed") void this.relaySync(relayId);
          return failure(result.error);
        }
        this.relayClosedHere(result.value);
        return { status: "done", sent: `@${allowed.username} gets: “${answer}”` };
      },
      decline: async (relayId) => {
        const allowed = answerable(relayId);
        if ("error" in allowed) return allowed;
        const result = await relays.decline(relayId);
        if (!result.ok) return failure(result.error);
        this.relayClosedHere(result.value);
        return { status: "done", declined: `@${allowed.username} will only hear that it was declined.` };
      },
      list: async () => {
        const result = await relays.list();
        return result.ok ? relayListView(result.value) : failure(result.error);
      },
    };
  }

  private showSent(relay: RelayJson) {
    if (this.cards.get(relay.id)) return;
    const message = this.thread.add({
      role: "system_event",
      body: sentEventBody(relay),
      meta: { relay: cardOf(relay, "pending") },
    });
    this.cards.add(
      { relayId: relay.id, direction: "out", messageId: message.id, cardSeq: this.thread.lastSeq(), status: "pending" },
      Date.now(),
    );
    this.send({ type: "bubble", message });
  }

  private showReceived(relay: RelayJson): boolean {
    if (this.cards.get(relay.id)) return false;
    const message = this.thread.add({
      role: "system_event",
      body: receivedEventBody(relay),
      meta: { relay: cardOf(relay, "delivered") },
    });
    this.cards.add(
      { relayId: relay.id, direction: "in", messageId: message.id, cardSeq: this.thread.lastSeq(), status: "delivered" },
      Date.now(),
    );
    this.send({ type: "bubble", message });
    return true;
  }

  private updateCard(relay: RelayJson): boolean {
    const card = this.cards.get(relay.id);
    if (!card || !this.cards.advance(relay.id, relay.status, Date.now())) return false;
    this.setMeta(card.messageId, "relay", cardOf(relay));
    return true;
  }

  private relayClosedHere(relay: RelayJson) {
    this.updateCard(relay);
    void relayClient(this.env.DOMAIN, this.name).ack(relay.id, relay.status);
    this.reachPeer(relay);
  }

  private reachPeer(relay: RelayJson) {
    void this.keepAliveWhile(async () => {
      try {
        const peer = await getAgentByName(
          this.env.TiboAgent as unknown as DurableObjectNamespace<TiboAgent>,
          relay.person.userId,
        );
        await peer.relaySync(relay.id);
      } catch (error) {
        console.error("Reaching the other Tibo failed; the sweep will retry", relay.id, error);
      }
    });
  }

  async relaySync(relayId: string) {
    const relays = relayClient(this.env.DOMAIN, this.name);
    const got = await relays.get(relayId);
    if (!got.ok) return { ok: false as const };
    if (got.value.direction === "in") await this.syncReceived(got.value);
    else await this.syncSent(got.value);
    return { ok: true as const };
  }

  private async syncReceived(relay: RelayJson) {
    const relays = relayClient(this.env.DOMAIN, this.name);
    if (relay.status === "pending" || relay.status === "delivered") {
      if (!this.cards.get(relay.id)) {
        const usage = usageClient(this.env.DOMAIN);
        const affordable = await Promise.all([
          usage.check(this.name, RELAY_UNITS_PER_SIDE),
          usage.check(relay.person.userId, RELAY_UNITS_PER_SIDE),
        ]).then(
          (checks) => checks.every((check) => check.allowed),
          () => false,
        );
        if (!affordable) {
          await relays.hold(relay.id);
          if (this.dev) console.log("Tibo relay held for quota", relay.id);
          return;
        }
      }
      const shown = this.showReceived(relay);
      const delivered = await relays.delivered(relay.id);
      if (delivered.ok && delivered.value.status !== "delivered") {
        this.updateCard(delivered.value);
        return;
      }
      if (shown) await this.schedule(1, "relayTurnFire", { relayId: relay.id, kind: "deliver" } satisfies RelayTurn);
      return;
    }
    if (this.updateCard(relay) && relay.status === "expired") {
      this.thread.add({ role: "system_event", body: outcomeEventBody(relay), meta: { relayEvent: relay.id } });
    }
    await relays.ack(relay.id, relay.status);
  }

  private async syncSent(relay: RelayJson) {
    const relays = relayClient(this.env.DOMAIN, this.name);
    if (relay.status === "pending" || relay.status === "delivered") {
      await relays.ack(relay.id, relay.status);
      return;
    }
    this.showSent(relay);
    if (this.updateCard(relay) && relay.status !== "cancelled") {
      this.thread.add({ role: "system_event", body: outcomeEventBody(relay), meta: { relayEvent: relay.id } });
      await this.schedule(1, "relayTurnFire", {
        relayId: relay.id,
        kind: relay.status === "expired" ? "expired" : "outcome",
      } satisfies RelayTurn);
    }
    await relays.ack(relay.id, relay.status);
  }

  async relayTurnFire(payload: RelayTurn) {
    if (this.running) {
      await this.schedule(RELAY_TURN_RETRY_S, "relayTurnFire", payload);
      return;
    }
    const job = this.exclusive(
      () => this.relayTurn(payload),
      (sinceSeq) => sinceSeq,
    );
    void job.catch((error: unknown) => console.error("Tibo relay turn failed", payload, error));
  }

  private async relayTurn({ relayId, kind }: RelayTurn): Promise<number> {
    const sinceSeq = this.thread.lastSeq();
    const turnId = crypto.randomUUID();
    const got = await relayClient(this.env.DOMAIN, this.name).get(relayId);
    if (!got.ok) return sinceSeq;
    const relay = got.value;
    const due =
      kind === "deliver"
        ?
          relay.direction === "in" && (relay.status === "delivered" || relay.status === "pending")
        : kind === "outcome"
          ? relay.direction === "out" && (relay.status === "answered" || relay.status === "declined")
          : relay.direction === "out" && relay.status === "expired";
    if (!due) return sinceSeq;
    const act = this.activity.start({
      kind: "relay",
      label:
        kind === "deliver"
          ? `Passing on a message from @${relay.person.username}`
          : kind === "outcome"
            ? `Telling you @${relay.person.username}'s answer`
            : `Telling you a message to @${relay.person.username} expired`,
    });
    try {
      if (kind === "expired") {
        await this.sayLine(expiredLine(relay), turnId, { relayTurn: relayId });
        return sinceSeq;
      }
      const fallback = kind === "deliver" ? deliveryFallback(relay) : outcomeFallback(relay);
      const usage = usageClient(this.env.DOMAIN);
      const affordable = await Promise.all([
        usage.check(this.name, RELAY_UNITS_PER_SIDE),
        usage.check(relay.person.userId, RELAY_UNITS_PER_SIDE),
      ]).then(
        (checks) => checks.every((check) => check.allowed),
        () => false,
      );
      if (!affordable) {
        await this.sayLine(fallback, turnId, { relayTurn: relayId });
        return sinceSeq;
      }
      let answered = false;
      try {
        const profile = await tiboClient(this.env.DOMAIN).profile(this.name);
        const context = buildTurnContext({
          persona: PERSONA,
          profile,
          now: new Date(),
          recent: this.thread.latest(RELAY_TURN_WINDOW).messages,
          sections: [kind === "deliver" ? deliverySection(relay) : outcomeSection(relay)],
        });
        answered = await this.reply(turnId, context, null, {}, new TurnLedger(), act);
      } catch (error) {
        console.error("Tibo relay turn failed; sending the fixed line", relayId, error);
        await this.sayLine(fallback, turnId, { relayTurn: relayId });
        return sinceSeq;
      }
      if (answered) {
        const [from, to] = relay.direction === "out" ? [this.name, relay.person.userId] : [relay.person.userId, this.name];
        await usage
          .chargeSplit(from, to, RELAY_UNITS_PER_SIDE, "relay", relayId)
          .catch((error: unknown) => console.error("Charging a relay turn failed", relayId, error));
        const after = await usage.get(this.name).catch(() => null);
        if (after) this.send({ type: "usage", remaining: after.remaining, limit: after.limit });
      }
      await this.notifyUser({ kind: "relay", turnId });
      if (this.dev) console.log("Tibo relay turn sent", kind, relayId);
      return sinceSeq;
    } catch (error) {
      act.end("failed");
      throw error;
    } finally {
      act.end();
      this.send({ type: "turnDone", turnId });
    }
  }

  private async sayLine(body: string, turnId: string, meta: MessageMeta = {}) {
    this.send({ type: "typing", on: true });
    await sleep(typingDelayMs(body));
    const message = this.thread.add({ role: "tibo", body, turnId, meta });
    this.send({ type: "typing", on: false });
    this.send({ type: "bubble", message });
  }

  private send(frame: TiboServerFrame) {
    this.broadcast(JSON.stringify(frame));
  }

  private sendTo(connection: Connection, frame: TiboServerFrame) {
    connection.send(JSON.stringify(frame));
  }
}

const CHECK_IN_LABEL: Record<ProactiveKind, string> = {
  morning_plan: "Morning check-in",
  deadline_nudge: "Deadline nudge",
  habit_check: "Evening habit check",
};

function turnDetail(ledger: TurnLedger): string | undefined {
  const made = ledger.receipts.filter((receipt) => !receipt.failed).length;
  const parts = [
    made > 0 ? `Made ${made} ${made === 1 ? "change" : "changes"}` : null,
    ledger.held.length > 0 ? `${ledger.held.length} waiting for your go-ahead` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function unansweredText(recent: readonly TiboMessage[]): string {
  const lastTibo = recent.findLastIndex((message) => message.role === "tibo");
  return recent
    .slice(lastTibo + 1)
    .filter((message) => message.role === "user")
    .map((message) => message.body)
    .join("\n")
    .slice(-1000);
}

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
    const attachments = Array.isArray(frame.attachments)
      ? frame.attachments
          .filter((id): id is string => typeof id === "string" && id.length <= 64)
          .slice(0, TIBO_MAX_ATTACHMENTS)
      : [];
    return {
      type: "send",
      text: frame.text,
      clientId: frame.clientId,
      ...(replyTo ? { replyTo } : {}),
      ...(attachments.length > 0 ? { attachments } : {}),
    };
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

class Channel<T> {
  #items: T[] = [];
  #closed = false;
  #error: unknown = undefined;
  #waiter: (() => void) | undefined;

  put(value: T) {
    this.#items.push(value);
    this.#wake();
  }

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

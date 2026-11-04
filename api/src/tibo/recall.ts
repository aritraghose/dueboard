/// <reference types="@cloudflare/workers-types" />

// What Tibo brings back from long-term memory during a turn (architecture.md
// §7.3): the "story so far" and "what you remember" context sections, and
// the backends of the `search_conversation`, `remember` and `forget` tools.

import type { ContextSection } from "./context.ts";
import { dayIn, startOfDayIn, addDays } from "./dates.ts";
import { embedDocuments, embedQuery } from "./embeddings.ts";
import { memoryVector, type MemoryEnv } from "./memory-jobs.ts";
import { memoryVectorId, parseVectorId, type MemoryRow, type MemoryStore } from "./memory.ts";
import {
  IMPORTANT_MEMORIES,
  RELATED_SCORE,
  RELEVANT_MEMORIES,
  RELEVANT_SCORE,
  SECTION_BUDGET_TOKENS,
  estimateTokens,
  ftsQuery,
  monthLabel,
  periodEnd,
  periodLabel,
  truncateToTokens,
  type SummaryLevel,
} from "./memory-rules.ts";
import type { TiboMemoryKind, TiboRole } from "./protocol.ts";
import type { Thread } from "./thread.ts";

export interface RecallContext {
  readonly env: MemoryEnv;
  readonly userId: string;
  readonly store: MemoryStore;
  readonly thread: Thread;
  readonly timeZone: string;
  readonly today: string;
}

/**
 * Short names for memories in one turn ("m1", "m2"), so the model can point
 * at them in `remember` and `forget` without seeing ids.
 */
export class MemoryRefs {
  private readonly byRef = new Map<string, string>();
  private readonly byId = new Map<string, string>();

  ref(id: string): string {
    let ref = this.byId.get(id);
    if (!ref) {
      ref = `m${this.byId.size + 1}`;
      this.byId.set(id, ref);
      this.byRef.set(ref, id);
    }
    return ref;
  }

  resolve(refs: readonly string[]): string[] {
    return refs.map((ref) => this.byRef.get(ref.trim().toLowerCase())).filter((id): id is string => id !== undefined);
  }
}

// ─── Context sections ──────────────────────────────────────────────────

/** The most tokens each level's summary may take in the story. */
const STORY_SHARE: Record<SummaryLevel, number> = { year: 420, month: 380, week: 300, day: 300 };

/**
 * "The story so far": the newest summary at each level (the year so far,
 * the month so far, the latest week and day), then last year's if the
 * budget still has room. `null` before the first summary exists.
 */
export const storySection = (store: MemoryStore, today: string): ContextSection | null => {
  const latest = (level: SummaryLevel) => store.latestSummaries(level, level === "year" ? 2 : 1);
  const [thisYear, lastYear] = latest("year");
  const parts = [
    ...(lastYear ? [{ level: "year" as const, summary: lastYear, optional: true }] : []),
    ...(thisYear ? [{ level: "year" as const, summary: thisYear, optional: false }] : []),
    ...(["month", "week", "day"] as const).flatMap((level) =>
      latest(level).map((summary) => ({ level, summary, optional: false })),
    ),
  ];
  if (parts.length === 0) return null;
  const lines = parts.map(({ level, summary, optional }) => {
    const inProgress = periodEnd(level, summary.periodStart) > today;
    const label = `${periodLabel(level, summary.periodStart)}${inProgress && level !== "day" ? " (so far)" : ""}`;
    return { optional, text: `${label}: ${truncateToTokens(summary.text, STORY_SHARE[level])}` };
  });
  // Last year goes first if the rest leaves no room.
  const required = lines.filter((line) => !line.optional);
  const total = lines.reduce((sum, line) => sum + estimateTokens(line.text), 0);
  const kept = total > SECTION_BUDGET_TOKENS.story ? required : lines;
  return {
    title: "The story so far",
    body: [
      "Summaries of your older conversations with them, oldest first (the recent messages below are newer):",
      ...kept.map((line) => line.text),
    ].join("\n\n"),
  };
};

/**
 * Memories for this turn: the ones closest in meaning to what the user just
 * said, then their newest important ones. Never superseded ones. An empty
 * list if the lookup fails: the turn goes on without them.
 */
export async function recallMemories(ctx: RecallContext, text: string): Promise<MemoryRow[]> {
  const important = ctx.store.recentImportant(3, IMPORTANT_MEMORIES);
  let relevant: MemoryRow[] = [];
  if (text.trim() && ctx.store.countActive() > 0) {
    try {
      const vector = await embedQuery(ctx.env, text);
      const { matches } = await ctx.env.MEMORY.query(vector, {
        namespace: ctx.userId,
        topK: RELEVANT_MEMORIES,
        filter: { type: "memory" },
      });
      const ids = matches
        .filter((match) => match.score >= RELEVANT_SCORE)
        .map((match) => parseVectorId(match.id))
        .filter((parsed) => parsed?.type === "memory")
        .map((parsed) => parsed!.id);
      const rows = new Map(ctx.store.activeMemories(ids).map((memory) => [memory.id, memory]));
      relevant = ids.map((id) => rows.get(id)).filter((memory): memory is MemoryRow => memory !== undefined);
    } catch (error) {
      console.error("Recalling memories failed", error);
    }
  }
  return [...new Map([...relevant, ...important].map((memory) => [memory.id, memory])).values()];
}

/** "What you remember about them", within its budget (the least relevant go first). */
export const memoriesSection = (
  memories: readonly MemoryRow[],
  refs: MemoryRefs,
  timeZone: string,
): ContextSection | null => {
  if (memories.length === 0) return null;
  const intro =
    "Lasting things you've learned about them in past conversations, most relevant first. They outrank your guesses, and a newer fact wins over an older one. The [m1]-style refs are for the remember and forget tools; never show them.";
  const lines: string[] = [];
  let tokens = estimateTokens(intro);
  for (const memory of memories) {
    const line = `- [${refs.ref(memory.id)}] ${memory.text} (${memory.kind}, since ${monthLabel(dayIn(timeZone, new Date(memory.createdAt)))})`;
    if (tokens + estimateTokens(line) > SECTION_BUDGET_TOKENS.memories) break;
    lines.push(line);
    tokens += estimateTokens(line);
  }
  return { title: "What you remember about them", body: [intro, ...lines].join("\n") };
};

// ─── search_conversation ───────────────────────────────────────────────

const WHO: Record<TiboRole, string> = { user: "user", tibo: "you", system_event: "app" };

/**
 * Keyword search (FTS5) and search by meaning (Vectorize, over thread
 * chunks) together, optionally between two of the user's days (inclusive).
 * Short dated excerpts, oldest first, plus any remembered facts that match.
 */
export async function searchConversation(
  ctx: RecallContext,
  refs: MemoryRefs,
  input: { query: string; from?: string; to?: string },
) {
  const from = input.from ? startOfDayIn(ctx.timeZone, input.from) : undefined;
  const to = input.to ? startOfDayIn(ctx.timeZone, addDays(input.to, 1)) : undefined;
  const filter = (type: "memory" | "message"): VectorizeVectorMetadataFilter =>
    from !== undefined || to !== undefined
      ? { type, created_at: { $gte: from ?? 0, $lt: to ?? Number.MAX_SAFE_INTEGER } }
      : { type };

  const match = ftsQuery(input.query);
  const keyword = match ? ctx.thread.search(match, { from, to, limit: 8 }) : [];

  let meaning: { day: string; text: string }[] = [];
  let memories: MemoryRow[] = [];
  try {
    const vector = await embedQuery(ctx.env, input.query);
    const [chunks, facts] = await Promise.all([
      ctx.env.MEMORY.query(vector, { namespace: ctx.userId, topK: 6, filter: filter("message") }),
      ctx.env.MEMORY.query(vector, { namespace: ctx.userId, topK: 4, filter: filter("memory") }),
    ]);
    const chunkIds = chunks.matches
      .filter((found) => found.score >= RELEVANT_SCORE)
      .map((found) => parseVectorId(found.id))
      .filter((parsed) => parsed?.type === "message")
      .map((parsed) => parsed!.id);
    meaning = ctx.store.chunks(chunkIds).map((chunk) => ({ day: chunk.day, text: truncateToTokens(chunk.text, 140) }));
    memories = ctx.store.activeMemories(
      facts.matches
        .filter((found) => found.score >= RELATED_SCORE)
        .map((found) => parseVectorId(found.id))
        .filter((parsed) => parsed?.type === "memory")
        .map((parsed) => parsed!.id),
    );
  } catch (error) {
    // Keyword results alone still answer a lot.
    console.error("Searching the conversation by meaning failed", error);
  }

  const excerpts = [
    ...keyword.map((hit) => ({ day: dayIn(ctx.timeZone, new Date(hit.createdAt)), who: WHO[hit.role], text: hit.snippet })),
    ...meaning.map((chunk) => ({ day: chunk.day, who: "conversation", text: chunk.text })),
  ].sort((a, b) => a.day.localeCompare(b.day));
  return {
    excerpts: excerpts.map(({ day, who, text }) => ({ date: day, who, text })),
    ...(memories.length > 0
      ? { remembered: memories.map((memory) => ({ ref: refs.ref(memory.id), text: memory.text })) }
      : {}),
    ...(excerpts.length === 0 && memories.length === 0
      ? { note: "Nothing found. Say so honestly; don't guess what was said." }
      : {}),
  };
}

// ─── remember / forget ─────────────────────────────────────────────────

/** Saves what the user asked Tibo to remember (importance 3), replacing the memories in `replaces`. */
export async function remember(
  ctx: RecallContext,
  refs: MemoryRefs,
  input: { text: string; kind: TiboMemoryKind; replaces: readonly string[]; sourceMessageId: string | null },
) {
  const replacing = ctx.store.activeMemories(refs.resolve(input.replaces));
  const memory = ctx.store.addMemory({
    text: input.text,
    kind: input.kind,
    importance: 3,
    sourceMessageIds: input.sourceMessageId ? [input.sourceMessageId] : [],
  });
  if (replacing.length > 0) ctx.store.supersede(replacing.map((old) => old.id), memory.id);

  let similar: MemoryRow[] = [];
  try {
    const [vector] = await embedDocuments(ctx.env, [memory.text]);
    await ctx.env.MEMORY.upsert([memoryVector(memory, vector!, ctx.userId)]);
    ctx.store.markMemoriesEmbedded([memory.id]);
    if (replacing.length > 0) await ctx.env.MEMORY.deleteByIds(replacing.map((old) => memoryVectorId(old.id)));
    const { matches } = await ctx.env.MEMORY.query(vector!, { namespace: ctx.userId, topK: 4, filter: { type: "memory" } });
    similar = ctx.store
      .activeMemories(
        matches
          .filter((found) => found.score >= RELATED_SCORE)
          .map((found) => parseVectorId(found.id)?.id)
          .filter((id): id is string => id !== undefined && id !== memory.id),
      );
  } catch (error) {
    // Stored all the same; the memory job embeds it later.
    console.error("Embedding a remembered memory failed", error);
  }
  return {
    memory,
    replaced: replacing,
    answer: {
      status: "remembered",
      ref: refs.ref(memory.id),
      ...(replacing.length > 0 ? { replaced: replacing.map((old) => old.text) } : {}),
      ...(similar.length > 0
        ? {
            similar: similar.map((other) => ({ ref: refs.ref(other.id), text: other.text })),
            next: "If any of these is now wrong or says the same thing, forget it.",
          }
        : {}),
    },
  };
}

/**
 * Forgets memories by ref, or finds the ones matching `about` so the model
 * can pick (nothing is deleted on a search).
 */
export async function forget(
  ctx: RecallContext,
  refs: MemoryRefs,
  input: { refs: readonly string[]; about?: string },
) {
  const chosen = ctx.store.activeMemories(refs.resolve(input.refs));
  if (chosen.length > 0) {
    await deleteMemories(ctx.env, ctx.store, chosen.map((memory) => memory.id));
    return { forgotten: chosen, answer: { status: "forgotten", memories: chosen.map((memory) => memory.text) } };
  }
  if (!input.about?.trim()) {
    return { forgotten: [], answer: { error: "Say which memory: pass refs, or `about` to look it up first." } };
  }
  const vector = await embedQuery(ctx.env, input.about);
  const { matches } = await ctx.env.MEMORY.query(vector, { namespace: ctx.userId, topK: 5, filter: { type: "memory" } });
  const found = ctx.store.activeMemories(
    matches
      .filter((match) => match.score >= RELEVANT_SCORE)
      .map((match) => parseVectorId(match.id)?.id)
      .filter((id): id is string => id !== undefined),
  );
  return {
    forgotten: [],
    answer:
      found.length > 0
        ? {
            status: "found",
            candidates: found.map((memory) => ({ ref: refs.ref(memory.id), text: memory.text })),
            next: "Nothing is forgotten yet. Call forget again with the refs that match; if it isn't clear which, ask the user.",
          }
        : { status: "nothing_found", note: "No memory matches. Tell the user there was nothing to forget." },
  };
}

/** Deletes memories: their vectors first, so a failure leaves the rows to retry from. */
export async function deleteMemories(env: MemoryEnv, store: MemoryStore, ids: readonly string[]) {
  if (ids.length === 0) return;
  await env.MEMORY.deleteByIds(ids.map(memoryVectorId));
  for (const id of ids) store.deleteMemory(id);
}

/// <reference types="@cloudflare/workers-types" />

// Embeddings for Tibo's long-term memory (architecture.md §7.3). A Workers
// AI model, run through the `AI` binding (not the gateway: no provider key
// is involved). Plain functions with no other imports, so the stack can
// read the dimensions without loading the agent.

/**
 * Qwen3 Embedding 0.6B: multilingual, 1024 dimensions, up to 4,096 input
 * tokens on Workers AI, $0.012 per million input tokens (chosen 2026-11-04).
 * Changing it means a new Vectorize index and re-embedding every row: rows
 * store the model that embedded them (`embedding_model`), and the memory
 * job re-embeds rows whose model isn't this one.
 */
export const EMBEDDING_MODEL = "@cf/qwen/qwen3-embedding-0.6b";
export const EMBEDDING_DIMENSIONS = 1024;

/** Qwen3 embeds queries with an instruction, and documents without one. */
const QUERY_INSTRUCTION =
  "Given a message or question from a user, retrieve facts about them and parts of their past conversations that help answer it";

/** Texts per model call. */
const BATCH = 24;
/** Characters kept per text (well under the model's input limit). */
const MAX_CHARS = 6000;

type EmbedEnv = { readonly AI: Ai };

type EmbeddingRun = (
  model: typeof EMBEDDING_MODEL,
  inputs: { documents?: string[]; queries?: string[]; instruction?: string },
) => Promise<{ data?: number[][]; shape?: number[] }>;

const run = async (env: EmbedEnv, inputs: Parameters<EmbeddingRun>[1], count: number) => {
  const result = await (env.AI.run.bind(env.AI) as unknown as EmbeddingRun)(EMBEDDING_MODEL, inputs);
  const vectors = result.data ?? [];
  if (vectors.length !== count || vectors.some((vector) => vector.length !== EMBEDDING_DIMENSIONS)) {
    throw new Error(`Embedding returned ${vectors.length} vectors for ${count} texts`);
  }
  return vectors;
};

/** Vectors for stored texts (memories, thread chunks), in order. */
export async function embedDocuments(env: EmbedEnv, texts: readonly string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let start = 0; start < texts.length; start += BATCH) {
    const documents = texts.slice(start, start + BATCH).map((text) => text.slice(0, MAX_CHARS));
    out.push(...(await run(env, { documents }, documents.length)));
  }
  return out;
}

/** The vector to search with for a user's message or question. */
export async function embedQuery(env: EmbedEnv, text: string): Promise<number[]> {
  const [vector] = await run(env, { queries: [text.slice(0, MAX_CHARS)], instruction: QUERY_INSTRUCTION }, 1);
  return vector!;
}

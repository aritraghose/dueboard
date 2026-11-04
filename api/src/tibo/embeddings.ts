/// <reference types="@cloudflare/workers-types" />

export const EMBEDDING_MODEL = "@cf/qwen/qwen3-embedding-0.6b";
export const EMBEDDING_DIMENSIONS = 1024;

const QUERY_INSTRUCTION =
  "Given a message or question from a user, retrieve facts about them and parts of their past conversations that help answer it";

const BATCH = 24;
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

export async function embedDocuments(env: EmbedEnv, texts: readonly string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let start = 0; start < texts.length; start += BATCH) {
    const documents = texts.slice(start, start + BATCH).map((text) => text.slice(0, MAX_CHARS));
    out.push(...(await run(env, { documents }, documents.length)));
  }
  return out;
}

export async function embedQuery(env: EmbedEnv, text: string): Promise<number[]> {
  const [vector] = await run(env, { queries: [text.slice(0, MAX_CHARS)], instruction: QUERY_INSTRUCTION }, 1);
  return vector!;
}

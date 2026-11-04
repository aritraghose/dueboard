/// <reference types="@cloudflare/workers-types" />

const BINDING_ORIGIN = "https://workers-binding.ai";

export const IMAGE_MODEL = "muse-image-1.0";

export const META_PROVIDER = "custom-meta";

export const IMAGE_COST_USD = 0.01;

export const IMAGE_TIMEOUT_MS = 150_000;

export const IMAGE_SHAPES = ["square", "portrait", "landscape"] as const;
export type ImageShape = (typeof IMAGE_SHAPES)[number];

export const IMAGE_SIZES: Record<ImageShape, string> = {
  square: "1024x1024",
  portrait: "1024x1536",
  landscape: "1536x1024",
};

export interface ImageReference {
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

export type ImageResult =
  | { readonly ok: true; readonly bytes: Uint8Array<ArrayBuffer>; readonly mediaType: "image/jpeg"; readonly ms: number }
  | {
      readonly ok: false;
      readonly reason: "blocked" | "failed";
      readonly detail: string;
    };

export async function museImage(
  env: { AI: Ai; AI_GATEWAY_ID: string },
  userId: string,
  request: { prompt: string; references: readonly ImageReference[]; shape: ImageShape },
): Promise<ImageResult> {
  const body = {
    model: IMAGE_MODEL,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: request.prompt },
          ...request.references.map((reference) => ({
            type: "input_image",
            image_url: `data:${reference.mediaType};base64,${toBase64(reference.bytes)}`,
          })),
        ],
      },
    ],
    tools: [{ type: "image_generation", size: IMAGE_SIZES[request.shape], output_format: "jpeg" }],
    store: false,
  };
  const started = Date.now();
  for (let attempt = 1; ; attempt += 1) {
    let response: Response;
    try {
      response = await (env.AI as unknown as { fetch: typeof fetch }).fetch(
        `${BINDING_ORIGIN}/ai-gateway/gateways/${encodeURIComponent(env.AI_GATEWAY_ID)}/${META_PROVIDER}/responses`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "cf-aig-metadata": JSON.stringify({ userId, purpose: "image" }),
            "cf-aig-custom-cost": JSON.stringify({ total_cost: IMAGE_COST_USD }),
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
        },
      );
    } catch (error) {
      return { ok: false, reason: "failed", detail: error instanceof Error ? error.message : String(error) };
    }
    const text = await response.text().catch(() => "");
    const json = parseJson(text) as ResponsesBody | null;
    if (response.ok) {
      const call = json?.output?.find((item) => item.type === "image_generation_call" && typeof item.result === "string");
      if (!call?.result) return { ok: false, reason: "failed", detail: "No image in the answer" };
      const ms = Date.now() - started;
      console.log("Muse image", { ms, attempt, references: request.references.length, shape: request.shape });
      return { ok: true, bytes: fromBase64(call.result), mediaType: "image/jpeg", ms };
    }
    const error = json?.error;
    if (response.status === 400 && error?.code === "content_policy_violation") {
      return { ok: false, reason: "blocked", detail: error.message ?? "Blocked by Meta's content rules" };
    }
    if (response.status === 503 && attempt === 1) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      continue;
    }
    return { ok: false, reason: "failed", detail: `${response.status} ${error?.message ?? (text.slice(0, 500) || response.statusText)}` };
  }
}

interface ResponsesBody {
  output?: { type: string; result?: string | null }[];
  error?: { code?: string; message?: string };
}

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const toBase64 = (bytes: Uint8Array) => {
  let text = "";
  for (let start = 0; start < bytes.length; start += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(text);
};

const fromBase64 = (text: string) => {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

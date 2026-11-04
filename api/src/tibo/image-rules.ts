import { AI_UNITS_PER_MESSAGE } from "../domain/usage-constants.ts";

export const IMAGES_PER_DAY = 5;

export const IMAGES_PER_TURN = 2;

export const IMAGE_UNITS = AI_UNITS_PER_MESSAGE;

export const IMAGE_REFERENCES_MAX = 4;

export const IMAGE_PROMPT_MAX = 2000;

export const IMAGE_REF_LENGTH = 8;

export const imageRef = (attachmentId: string) => attachmentId.slice(0, IMAGE_REF_LENGTH);

export function parseImageRef(text: string): string | null {
  const ref = text
    .trim()
    .toLowerCase()
    .replace(/^(image|img)[\s:#-]*/, "")
    .replace(/^#/, "");
  return /^[0-9a-f-]{4,36}$/.test(ref) ? ref.slice(0, IMAGE_REF_LENGTH) : null;
}

export type ImageRefusal = "turn_limit" | "daily_limit" | "storage_full";

export function imageRefusal(state: {
  madeThisTurn: number;
  madeToday: number;
  storedBytes: number;
  storageMaxBytes: number;
}): ImageRefusal | null {
  if (state.madeThisTurn >= IMAGES_PER_TURN) return "turn_limit";
  if (state.madeToday >= IMAGES_PER_DAY) return "daily_limit";
  if (state.storedBytes + 8 * 1024 * 1024 > state.storageMaxBytes) return "storage_full";
  return null;
}

export const IMAGE_REFUSAL_TEXT: Record<ImageRefusal | "no_quota" | "blocked" | "failed" | "unknown_image", string> = {
  turn_limit: `That's ${IMAGES_PER_TURN} images in this reply, the most for one. Say so, and offer to make more in the next.`,
  daily_limit: `They've had ${IMAGES_PER_DAY} images in the last 24 hours, the most for a day. Tell them, kindly, and that more come tomorrow.`,
  storage_full: "Their storage for chat files is full. They can free some by deleting files they've sent.",
  no_quota: "An image costs one more message and they don't have enough left this month. Tell them.",
  blocked: "Meta's content rules refused this picture. Say you can't make that one, without lecturing, and offer something close that's fine.",
  failed: "The image didn't come out (a problem on the image service's side). Say so and offer to try again.",
  unknown_image: "No picture in this chat has that ref. Use the ref shown next to a picture, like `3f2a9c1b`.",
};

export function imageFileName(prompt: string, mediaType: string): string {
  const slug = prompt
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join("-")
    .slice(0, 48)
    .replace(/-+$/, "");
  const extension = mediaType === "image/png" ? "png" : mediaType === "image/jpeg" ? "jpg" : "webp";
  return `tibo-${slug || "image"}.${extension}`;
}

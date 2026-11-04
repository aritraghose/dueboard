import {
  TIBO_AGENT,
  TIBO_FILES_PATH,
  TIBO_FILE_MAX_BYTES,
  type TiboAttachment,
  type TiboAttachmentKind,
  type TiboUpload,
} from "@dueboard/api/tibo";

export async function uploadTiboFile(file: File, signal?: AbortSignal): Promise<TiboUpload> {
  if (file.size === 0) return { ok: false, error: "empty" };
  if (file.size > TIBO_FILE_MAX_BYTES) return { ok: false, error: "too_large" };
  try {
    const response = await fetch(`/agents/${TIBO_AGENT}/me/${TIBO_FILES_PATH}`, {
      method: "POST",
      headers: { "x-file-name": encodeURIComponent(file.name), "content-type": "application/octet-stream" },
      body: file,
      signal,
    });
    const answer = (await response.json().catch(() => null)) as TiboUpload | null;
    if (answer && typeof answer.ok === "boolean") return answer;
    return { ok: false, error: response.status === 429 ? "limited" : "failed" };
  } catch {
    return { ok: false, error: "failed" };
  }
}

const UPLOAD_ERROR: Record<Exclude<TiboUpload, { ok: true }>["error"], string> = {
  too_large: `Too big. Files can be up to ${TIBO_FILE_MAX_BYTES / (1024 * 1024)} MB.`,
  empty: "This file is empty.",
  limited: "Too many files at once. Wait a minute, then try again.",
  daily_limit: "You've sent a lot of files today. Try again tomorrow.",
  storage_full: "Your chat files are full.",
  failed: "Couldn't upload. Try again.",
};

export const uploadErrorText = (error: keyof typeof UPLOAD_ERROR) => UPLOAD_ERROR[error];

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export const FILE_KIND_TAG: Record<TiboAttachmentKind, string> = {
  image: "teal",
  pdf: "red",
  document: "blue",
  text: "gray",
  other: "violet",
};

export function fileKindLabel(attachment: Pick<TiboAttachment, "kind" | "name">): string {
  const extension = attachment.name.includes(".") ? attachment.name.split(".").pop()!.toLowerCase() : "";
  switch (attachment.kind) {
    case "image":
      return "Image";
    case "pdf":
      return "PDF";
    case "document":
      return ["xlsx", "xlsm", "xlsb", "xls", "ods", "numbers"].includes(extension) ? "Spreadsheet" : "Document";
    case "text":
      return extension && extension.length <= 5 ? extension.toUpperCase() : "Text";
    case "other":
      return extension && extension.length <= 5 ? extension.toUpperCase() : "File";
  }
}

export const fileNames = (attachments: readonly Pick<TiboAttachment, "name">[] = []) =>
  attachments.map((attachment) => `📎 ${attachment.name}`).join(", ");

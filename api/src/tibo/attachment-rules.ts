import {
  TIBO_FILE_NAME_MAX_LENGTH,
  type TiboAttachment,
  type TiboAttachmentKind,
} from "./protocol.ts";

export const TIBO_STORAGE_MAX_BYTES = 500 * 1024 * 1024;
export const TIBO_UPLOADS_PER_DAY = 100;
export const ORPHAN_TTL_MS = 24 * 60 * 60 * 1000;
export const FILE_TEXT_MAX_LENGTH = 16_000;
export const TURN_FILE_TEXT_MAX_LENGTH = 32_000;
export const TURN_FILE_MAX_BYTES = 20 * 1024 * 1024;
const DOCUMENT_EXTENSIONS = new Set(["docx", "xlsx", "xlsm", "xlsb", "xls", "ods", "odt", "numbers"]);

export const objectKey = (userId: string, attachmentId: string) => `tibo/${userId}/${attachmentId}`;
export const userPrefix = (userId: string) => `tibo/${userId}/`;

export function cleanFileName(header: string | null): string {
  let name = "";
  try {
    name = decodeURIComponent(header ?? "");
  } catch {
  }
  name = name
    .replace(/[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069/\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (name.length > TIBO_FILE_NAME_MAX_LENGTH) {
    const dot = name.lastIndexOf(".");
    const extension = dot > 0 && name.length - dot <= 10 ? name.slice(dot) : "";
    name = `${name.slice(0, TIBO_FILE_NAME_MAX_LENGTH - extension.length).trim()}${extension}`;
  }
  return name || "File";
}

const extensionOf = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((byte, index) => bytes[offset + index] === byte);

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

export function sniff(bytes: Uint8Array, name: string): { kind: TiboAttachmentKind; mediaType: string } {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: "image", mediaType: "image/png" };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { kind: "image", mediaType: "image/jpeg" };
  if (startsWith(bytes, ascii("GIF87a")) || startsWith(bytes, ascii("GIF89a"))) return { kind: "image", mediaType: "image/gif" };
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return { kind: "image", mediaType: "image/webp" };
  if (startsWith(bytes, ascii("%PDF-"))) return { kind: "pdf", mediaType: "application/pdf" };
  const extension = extensionOf(name);
  const container = startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0]);
  if (container) {
    return DOCUMENT_EXTENSIONS.has(extension)
      ? { kind: "document", mediaType: "application/octet-stream" }
      : { kind: "other", mediaType: "application/octet-stream" };
  }
  if (isText(bytes)) return { kind: "text", mediaType: "text/plain; charset=utf-8" };
  return { kind: "other", mediaType: "application/octet-stream" };
}

export function isText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, 64 * 1024);
  if (sample.length === 0 || sample.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample, { stream: sample.length < bytes.length });
    return true;
  } catch {
    return false;
  }
}

export function capText(text: string, max = FILE_TEXT_MAX_LENGTH): { text: string; truncated: boolean } {
  const clean = text.replace(/\r\n?/g, "\n").trim();
  return clean.length > max ? { text: clean.slice(0, max), truncated: true } : { text: clean, truncated: false };
}

export function imageSize(bytes: Uint8Array, mediaType: string): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fits = (n: number) => bytes.length >= n;
  const ok = (width: number, height: number) =>
    width > 0 && height > 0 && width <= 100_000 && height <= 100_000 ? { width, height } : null;
  try {
    if (mediaType === "image/png" && fits(24)) return ok(view.getUint32(16), view.getUint32(20));
    if (mediaType === "image/gif" && fits(10)) return ok(view.getUint16(6, true), view.getUint16(8, true));
    if (mediaType === "image/webp" && fits(30)) {
      const chunk = String.fromCharCode(...bytes.subarray(12, 16));
      if (chunk === "VP8X") return ok(1 + (view.getUint32(24, true) & 0xffffff), 1 + (view.getUint32(27, true) & 0xffffff));
      if (chunk === "VP8 ") return ok(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
      if (chunk === "VP8L") {
        const bits = view.getUint32(21, true);
        return ok(1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff));
      }
      return null;
    }
    if (mediaType === "image/jpeg") {
      let offset = 2;
      while (fits(offset + 9)) {
        if (bytes[offset] !== 0xff) return null;
        const marker = bytes[offset + 1]!;
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return ok(view.getUint16(offset + 7), view.getUint16(offset + 5));
        }
        offset += 2 + view.getUint16(offset + 2);
      }
    }
  } catch {
  }
  return null;
}

export const showsInline = (attachment: Pick<TiboAttachment, "kind">) =>
  attachment.kind === "image" || attachment.kind === "pdf";

export function contentDisposition(name: string, inline: boolean): string {
  const fallback = name.replace(/[^\x20-\x7E]|["\\%;]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export function serveHeaders(attachment: TiboAttachment, download: boolean): Headers {
  const inline = !download && showsInline(attachment);
  const headers = new Headers({
    "content-type": attachment.mediaType,
    "content-length": String(attachment.size),
    "content-disposition": contentDisposition(attachment.name, inline),
    "x-content-type-options": "nosniff",
    "cross-origin-resource-policy": "same-origin",
    "referrer-policy": "no-referrer",
    "cache-control": "private, max-age=86400, immutable",
  });
  if (attachment.kind !== "pdf") headers.set("content-security-policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  return headers;
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

const KIND_WORD: Record<TiboAttachmentKind, string> = {
  image: "image",
  pdf: "PDF",
  text: "text file",
  document: "document",
  other: "file",
};

const escapeAttribute = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const attachmentLine = (attachment: Pick<TiboAttachment, "name" | "kind" | "size"> & { readonly ref?: string }) =>
  `[Attached ${KIND_WORD[attachment.kind]}: "${attachment.name.replace(/"/g, "'")}", ${formatBytes(attachment.size)}${refPart(attachment)}]`;

const refPart = (file: { readonly kind: TiboAttachmentKind; readonly ref?: string }) =>
  file.kind === "image" && file.ref ? `, ref ${file.ref}` : "";

export interface FileLine {
  readonly name: string;
  readonly kind: TiboAttachmentKind;
  readonly size: number;
  readonly note: string | null;
  readonly ref?: string;
}

export const fileLine = (file: FileLine) =>
  file.note
    ? `[Sent ${KIND_WORD[file.kind]} "${file.name.replace(/"/g, "'")}"${file.kind === "image" && file.ref ? ` (ref ${file.ref})` : ""}: ${file.note.replace(/\s+/g, " ").trim()}]`
    : attachmentLine(file);

export const attachedFileBlock = (name: string, text: string, truncated: boolean) =>
  `<attached_file name="${escapeAttribute(name)}"${truncated ? ' truncated="true"' : ""}>\n${escapeText(text)}\n</attached_file>`;

export const unreadableNote = (attachment: Pick<TiboAttachment, "name" | "kind">, reason: "kind" | "budget" | "missing") =>
  `[The file "${attachment.name.replace(/"/g, "'")}" ${
    reason === "kind"
      ? "is a kind you can't open: you only know its name"
      : reason === "budget"
        ? "didn't fit in this turn: ask them to send it again on its own"
        : "couldn't be read: ask them to send it again"
  }]`;

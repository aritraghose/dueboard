// Files in Tibo's chat (architecture.md §7.9): the pure rules. What a file
// is (from its bytes, never from its name or the browser's claim), how it's
// named and served, and how the model reads it. No I/O, so it's tested.

import {
  TIBO_FILE_NAME_MAX_LENGTH,
  type TiboAttachment,
  type TiboAttachmentKind,
} from "./protocol.ts";

/** Most bytes one user may keep in chat files. */
export const TIBO_STORAGE_MAX_BYTES = 500 * 1024 * 1024;
/** Most uploads per user in any 24 hours (sent or not). */
export const TIBO_UPLOADS_PER_DAY = 100;
/** Uploaded but never sent: deleted after this long (ms). */
export const ORPHAN_TTL_MS = 24 * 60 * 60 * 1000;
/** The most text kept from one text file or document, in characters. */
export const FILE_TEXT_MAX_LENGTH = 16_000;
/** The most file text the model reads in one turn, in characters. */
export const TURN_FILE_TEXT_MAX_LENGTH = 32_000;
/** The most bytes of images and PDFs the model reads in one turn. */
export const TURN_FILE_MAX_BYTES = 20 * 1024 * 1024;
/** Documents Workers AI's `toMarkdown` turns into text, by extension. */
const DOCUMENT_EXTENSIONS = new Set(["docx", "xlsx", "xlsm", "xlsb", "xls", "ods", "odt", "numbers"]);

/** Where a user's file lives in the bucket. Built from the agent's own name, never from the browser. */
export const objectKey = (userId: string, attachmentId: string) => `tibo/${userId}/${attachmentId}`;
/** Every file of a user's, for account deletion. */
export const userPrefix = (userId: string) => `tibo/${userId}/`;

/** The file's name as the browser sent it (URI-encoded), tidied, or a plain default. */
export function cleanFileName(header: string | null): string {
  let name = "";
  try {
    name = decodeURIComponent(header ?? "");
  } catch {
    // A malformed escape: use the default.
  }
  name = name
    // Control and bidi-override characters (a name that reads `photo.jpg` but is `gpj.exe`), and paths.
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

/** What the file is and the type it's served as, from its first bytes. */
export function sniff(bytes: Uint8Array, name: string): { kind: TiboAttachmentKind; mediaType: string } {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: "image", mediaType: "image/png" };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { kind: "image", mediaType: "image/jpeg" };
  if (startsWith(bytes, ascii("GIF87a")) || startsWith(bytes, ascii("GIF89a"))) return { kind: "image", mediaType: "image/gif" };
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return { kind: "image", mediaType: "image/webp" };
  if (startsWith(bytes, ascii("%PDF-"))) return { kind: "pdf", mediaType: "application/pdf" };
  const extension = extensionOf(name);
  // Office files are ZIPs (OLE for `.xls`); only the extension tells which.
  const container = startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0]);
  if (container) {
    return DOCUMENT_EXTENSIONS.has(extension)
      ? { kind: "document", mediaType: "application/octet-stream" }
      : { kind: "other", mediaType: "application/octet-stream" };
  }
  // Anything that reads as text is served as plain text, whatever it is
  // (HTML and SVG included), so a browser never runs it.
  if (isText(bytes)) return { kind: "text", mediaType: "text/plain; charset=utf-8" };
  return { kind: "other", mediaType: "application/octet-stream" };
}

/** Valid UTF-8 with no NUL bytes in the first 64 KiB. */
export function isText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, 64 * 1024);
  if (sample.length === 0 || sample.includes(0)) return false;
  try {
    // A cut at 64 KiB may split a character: `stream` lets that pass.
    new TextDecoder("utf-8", { fatal: true }).decode(sample, { stream: sample.length < bytes.length });
    return true;
  } catch {
    return false;
  }
}

/** A file's text, capped at `max` characters. */
export function capText(text: string, max = FILE_TEXT_MAX_LENGTH): { text: string; truncated: boolean } {
  const clean = text.replace(/\r\n?/g, "\n").trim();
  return clean.length > max ? { text: clean.slice(0, max), truncated: true } : { text: clean, truncated: false };
}

/** An image's pixel size from its header, or `null` if it can't be read. */
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
        // Start-of-frame markers, except DHT (C4), JPG (C8) and DAC (CC).
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return ok(view.getUint16(offset + 7), view.getUint16(offset + 5));
        }
        offset += 2 + view.getUint16(offset + 2);
      }
    }
  } catch {
    // A truncated or odd header.
  }
  return null;
}

/** Whether the browser may show the file in the page (images and PDFs) rather than only save it. */
export const showsInline = (attachment: Pick<TiboAttachment, "kind">) =>
  attachment.kind === "image" || attachment.kind === "pdf";

/** A `Content-Disposition` header that's safe for any name (RFC 6266 / 5987). */
export function contentDisposition(name: string, inline: boolean): string {
  const fallback = name.replace(/[^\x20-\x7E]|["\\%;]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * The headers a file is served with. Its type comes from its sniffed bytes;
 * `nosniff` stops the browser guessing another. Anything but an image or
 * a PDF is only ever downloaded. The sandbox CSP keeps any script from
 * running as the site even if a file is opened directly; PDFs skip it
 * because browsers' viewers won't render in a sandbox (they never run a
 * PDF's script as the page). Private and never shared between users or
 * sites: only this origin may load it.
 */
export function serveHeaders(attachment: TiboAttachment, download: boolean): Headers {
  const inline = !download && showsInline(attachment);
  const headers = new Headers({
    "content-type": attachment.mediaType,
    "content-length": String(attachment.size),
    "content-disposition": contentDisposition(attachment.name, inline),
    "x-content-type-options": "nosniff",
    "cross-origin-resource-policy": "same-origin",
    "referrer-policy": "no-referrer",
    // The id never points at other bytes, so the owner's browser may keep it.
    "cache-control": "private, max-age=86400, immutable",
  });
  if (attachment.kind !== "pdf") headers.set("content-security-policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  return headers;
}

/** "2.4 MB" */
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

/** How an attachment reads in the model's copy of the thread: a short line naming it. */
export const attachmentLine = (attachment: Pick<TiboAttachment, "name" | "kind" | "size">) =>
  `[Attached ${KIND_WORD[attachment.kind]}: "${attachment.name.replace(/"/g, "'")}", ${formatBytes(attachment.size)}]`;

/** A file in a transcript the memory jobs read: its name, and its note when there is one. */
export interface FileLine {
  readonly name: string;
  readonly kind: TiboAttachmentKind;
  readonly size: number;
  /** What's in it (the memory jobs' note), or `null` to name it only. */
  readonly note: string | null;
}

/** `[Sent image "cat.jpg": A grey cat asleep on a red sofa.]`, or the plain line with no note. */
export const fileLine = (file: FileLine) =>
  file.note
    ? `[Sent ${KIND_WORD[file.kind]} "${file.name.replace(/"/g, "'")}": ${file.note.replace(/\s+/g, " ").trim()}]`
    : attachmentLine(file);

/**
 * A text file's or document's contents for the model, escaped inside
 * `<attached_file>`: the persona calls it data, never instructions.
 */
export const attachedFileBlock = (name: string, text: string, truncated: boolean) =>
  `<attached_file name="${escapeAttribute(name)}"${truncated ? ' truncated="true"' : ""}>\n${escapeText(text)}\n</attached_file>`;

/** What the model is told about a file it can't open in this turn. */
export const unreadableNote = (attachment: Pick<TiboAttachment, "name" | "kind">, reason: "kind" | "budget" | "missing") =>
  `[The file "${attachment.name.replace(/"/g, "'")}" ${
    reason === "kind"
      ? "is a kind you can't open: you only know its name"
      : reason === "budget"
        ? "didn't fit in this turn: ask them to send it again on its own"
        : "couldn't be read: ask them to send it again"
  }]`;

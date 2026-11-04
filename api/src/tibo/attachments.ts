/// <reference types="@cloudflare/workers-types" />

// Files in Tibo's chat (architecture.md §7.9). The bytes live in the
// private `TiboFiles` R2 bucket, bound to the AgentWorker alone, under
// `tibo/<user id>/<attachment id>`; what each file is lives here, in the
// user's own `TiboAgent` SQLite. A file is reachable only through this
// table: an id the agent didn't store for its own user doesn't exist.

import type { FilePart, TextPart } from "ai";
import {
  ORPHAN_TTL_MS,
  attachedFileBlock,
  attachmentLine,
  capText,
  imageSize,
  objectKey,
  sniff,
  unreadableNote,
  userPrefix,
} from "./attachment-rules.ts";
import type { TiboAttachment, TiboAttachmentKind, TiboSentFile } from "./protocol.ts";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  media_type TEXT NOT NULL,
  kind TEXT NOT NULL,
  size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  -- A text file's or document's text (capped), for the model.
  text TEXT,
  text_truncated INTEGER NOT NULL DEFAULT 0,
  -- The message it was sent with; NULL until then.
  message_id TEXT,
  -- A short factual note of what's in it, written by the memory jobs for
  -- the transcripts they read (memories, summaries, search) and for later
  -- turns. pending → done, or skipped (a kind the model can't read, or
  -- after failed attempts).
  note TEXT,
  note_state TEXT NOT NULL DEFAULT 'pending' CHECK (note_state IN ('pending', 'done', 'skipped')),
  note_attempts INTEGER NOT NULL DEFAULT 0,
  -- The note's judgement: 1 when the file holds something lasting about
  -- the user worth keeping in memory. Only those feed memory extraction
  -- and the summaries; every note still serves search and later turns.
  memorable INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS attachments_message_idx ON attachments (message_id);
CREATE INDEX IF NOT EXISTS attachments_created_idx ON attachments (created_at);
`;

type Row = {
  id: string;
  name: string;
  media_type: string;
  kind: TiboAttachmentKind;
  size: number;
  width: number | null;
  height: number | null;
  text: string | null;
  text_truncated: number;
  message_id: string | null;
  note: string | null;
  note_state: NoteState;
  note_attempts: number;
  memorable: number;
  created_at: number;
};

type NoteState = "pending" | "done" | "skipped";

const toAttachment = (row: Row): TiboAttachment => ({
  id: row.id,
  name: row.name,
  mediaType: row.media_type,
  kind: row.kind,
  size: row.size,
  ...(row.width !== null && row.height !== null ? { width: row.width, height: row.height } : {}),
});

/** A stored file and, for text files and documents, its text. */
export interface StoredAttachment {
  readonly attachment: TiboAttachment;
  readonly text: string | null;
  readonly textTruncated: boolean;
}

/** Turns a document into text (Workers AI `toMarkdown`); `null` if it can't. */
export type DocumentReader = (name: string, bytes: Uint8Array<ArrayBuffer>) => Promise<string | null>;

/** What the memory jobs wrote about a file. */
export interface FileNote {
  readonly note: string | null;
  /** Not written yet: memory waits for it. */
  readonly pending: boolean;
  /** Worth keeping in long-term memory. */
  readonly memorable: boolean;
}

/** Failed tries at a file's note before it's skipped (so memory never waits on it forever). */
export const NOTE_ATTEMPTS = 2;

export class AttachmentStore {
  constructor(
    private readonly sql: SqlStorage,
    private readonly bucket: R2Bucket,
    /** The agent's own name: the user every file here belongs to. */
    private readonly userId: string,
  ) {}

  migrate() {
    this.sql.exec(SCHEMA);
  }

  /** Bytes stored and uploads since `since` (ms). */
  usage(since: number): { bytes: number; uploads: number } {
    const row = this.sql
      .exec<{ bytes: number | null; uploads: number }>(
        `SELECT sum(size) AS bytes, sum(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS uploads FROM attachments`,
        since,
      )
      .one();
    return { bytes: row.bytes ?? 0, uploads: row.uploads ?? 0 };
  }

  /**
   * Stores one file: sniffs what it is, reads a text file's or document's
   * text, puts the bytes in R2, then records it. The R2 write comes first,
   * so a row never points at nothing.
   */
  async create(name: string, bytes: Uint8Array<ArrayBuffer>, readDocument: DocumentReader): Promise<TiboAttachment> {
    const id = crypto.randomUUID();
    const { kind, mediaType } = sniff(bytes, name);
    const size = kind === "image" ? imageSize(bytes, mediaType) : null;
    let text: { text: string; truncated: boolean } | null = null;
    if (kind === "text") text = capText(new TextDecoder().decode(bytes));
    // A PDF's text too: the fallback when the model can't take the file itself.
    if (kind === "document" || kind === "pdf") {
      const read = await readDocument(name, bytes);
      if (read) text = capText(read);
    }
    await this.bucket.put(objectKey(this.userId, id), bytes, {
      httpMetadata: { contentType: mediaType },
    });
    const row = this.sql
      .exec<Row>(
        `INSERT INTO attachments (id, name, media_type, kind, size, width, height, text, text_truncated, note_state, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
        id,
        name,
        mediaType,
        kind,
        bytes.byteLength,
        size?.width ?? null,
        size?.height ?? null,
        text && text.text.length > 0 ? text.text : null,
        text?.truncated ? 1 : 0,
        // Nothing to read in an `other` file, or a document that wouldn't convert.
        kind === "other" || ((kind === "text" || kind === "document") && !text?.text) ? "skipped" : "pending",
        Date.now(),
      )
      .one();
    return toAttachment(row);
  }

  get(id: string): StoredAttachment | null {
    const row = this.sql.exec<Row>(`SELECT * FROM attachments WHERE id = ?`, id).toArray()[0];
    return row ? { attachment: toAttachment(row), text: row.text, textTruncated: row.text_truncated === 1 } : null;
  }

  /** The file's bytes from R2, as a stream, or `null` if they're gone. */
  async object(id: string): Promise<R2ObjectBody | null> {
    return await this.bucket.get(objectKey(this.userId, id));
  }

  /** The file's bytes, or `null` if they're gone. */
  async bytes(id: string): Promise<Uint8Array | null> {
    const object = await this.object(id);
    return object ? new Uint8Array(await object.arrayBuffer()) : null;
  }

  /**
   * Ties uploaded files to the message they're sent with. Only files that
   * exist here and weren't sent yet: anything else in `ids` is dropped. In
   * the order given.
   */
  claim(ids: readonly string[], messageId: string): TiboAttachment[] {
    const claimed: TiboAttachment[] = [];
    for (const id of new Set(ids)) {
      const row = this.sql
        .exec<Row>(`UPDATE attachments SET message_id = ? WHERE id = ? AND message_id IS NULL RETURNING *`, messageId, id)
        .toArray()[0];
      if (row) claimed.push(toAttachment(row));
    }
    return claimed;
  }

  /** Files that exist here and weren't sent yet, from `ids`, in order. */
  unsent(ids: readonly string[]): TiboAttachment[] {
    return [...new Set(ids)].flatMap((id) => {
      const row = this.sql.exec<Row>(`SELECT * FROM attachments WHERE id = ? AND message_id IS NULL`, id).toArray()[0];
      return row ? [toAttachment(row)] : [];
    });
  }

  // ─── File notes (for memory) ───────────────────────────────────────────

  /** Sent files still waiting for their note, oldest first, with the message they came with. */
  pendingNotes(limit: number): (StoredAttachment & { readonly messageId: string })[] {
    return this.sql
      .exec<Row>(
        `SELECT * FROM attachments WHERE note_state = 'pending' AND message_id IS NOT NULL ORDER BY created_at LIMIT ?`,
        limit,
      )
      .toArray()
      .map((row) => ({
        attachment: toAttachment(row),
        text: row.text,
        textTruncated: row.text_truncated === 1,
        messageId: row.message_id!,
      }));
  }

  /** Saves a file's note and judgement, or counts a failed attempt (skipped after `NOTE_ATTEMPTS`). */
  saveNote(id: string, result: { note: string; memorable: boolean } | null) {
    if (result !== null) {
      this.sql.exec(
        `UPDATE attachments SET note = ?, memorable = ?, note_state = 'done' WHERE id = ?`,
        result.note,
        result.memorable ? 1 : 0,
        id,
      );
      return;
    }
    this.sql.exec(
      `UPDATE attachments SET note_attempts = note_attempts + 1,
         note_state = CASE WHEN note_attempts + 1 >= ? THEN 'skipped' ELSE note_state END
       WHERE id = ?`,
      NOTE_ATTEMPTS,
      id,
    );
  }

  /** Each file's note, its judgement and whether it's still being written, by id. */
  notes(ids: readonly string[]): Map<string, FileNote> {
    const out = new Map<string, FileNote>();
    for (const id of ids) {
      const row = this.sql
        .exec<{ note: string | null; note_state: NoteState; memorable: number }>(
          `SELECT note, note_state, memorable FROM attachments WHERE id = ?`,
          id,
        )
        .toArray()[0];
      if (row) out.set(id, { note: row.note, pending: row.note_state === "pending", memorable: row.memorable === 1 });
    }
    return out;
  }

  /** Files sent in the chat, newest first (the Media tab). */
  sent(limit: number): TiboSentFile[] {
    return this.sql
      .exec<Row>(`SELECT * FROM attachments WHERE message_id IS NOT NULL ORDER BY created_at DESC LIMIT ?`, limit)
      .toArray()
      .map((row) => ({ ...toAttachment(row), messageId: row.message_id!, sentAt: row.created_at }));
  }

  /** Deletes files uploaded but never sent within `ORPHAN_TTL_MS`. */
  async pruneOrphans(now: number) {
    const ids = this.sql
      .exec<{ id: string }>(`SELECT id FROM attachments WHERE message_id IS NULL AND created_at < ? LIMIT 500`, now - ORPHAN_TTL_MS)
      .toArray()
      .map((row) => row.id);
    if (ids.length === 0) return;
    await this.bucket.delete(ids.map((id) => objectKey(this.userId, id)));
    for (const id of ids) this.sql.exec(`DELETE FROM attachments WHERE id = ?`, id);
  }

  /**
   * Account deletion: every object under the user's prefix, listed from R2
   * itself so nothing this table lost track of is left behind. Throws on
   * a failure, so the wipe is retried before anything else is gone.
   */
  async deleteAll() {
    const prefix = userPrefix(this.userId);
    for (;;) {
      const listed = await this.bucket.list({ prefix, limit: 1000 });
      if (listed.objects.length === 0) break;
      await this.bucket.delete(listed.objects.map((object) => object.key));
      if (!listed.truncated) break;
    }
    this.sql.exec(`DELETE FROM attachments`);
  }
}

/**
 * Whether PDFs reach the model as files (Muse Spark reads them, pictures
 * included) or as their extracted text.
 */
export const PDF_AS_FILE = true;

/** What's left of a turn's room for files: bytes of images and PDFs, characters of text. */
export interface FileBudget {
  bytes: number;
  text: number;
}

const textPart = (text: string): TextPart => ({ type: "text", text });

/**
 * The model's view of these files, for a user message's content: a line
 * naming each, then the image or PDF itself, or a text file's or
 * document's text inside `<attached_file>`. What doesn't fit `budget`, or
 * can't be read, is named with a note saying so. Spends the budget.
 */
export async function fileContent(
  store: AttachmentStore,
  attachments: readonly TiboAttachment[],
  budget: FileBudget,
  /** PDFs as their text even when `PDF_AS_FILE` (the fallback when the model refused one). */
  pdfAsText = false,
): Promise<(TextPart | FilePart)[]> {
  const parts: (TextPart | FilePart)[] = [];
  for (const attachment of attachments) {
    const stored = store.get(attachment.id);
    if (!stored) {
      parts.push(textPart(unreadableNote(attachment, "missing")));
      continue;
    }
    const native = attachment.kind === "image" || (attachment.kind === "pdf" && PDF_AS_FILE && !pdfAsText);
    if (native) {
      if (attachment.size > budget.bytes) {
        parts.push(textPart(unreadableNote(attachment, "budget")));
        continue;
      }
      const bytes = await store.bytes(attachment.id);
      if (!bytes) {
        parts.push(textPart(unreadableNote(attachment, "missing")));
        continue;
      }
      budget.bytes -= attachment.size;
      parts.push(textPart(attachmentLine(attachment)));
      parts.push({ type: "file", data: bytes, mediaType: attachment.mediaType, filename: attachment.name });
      continue;
    }
    if (stored.text === null) {
      parts.push(textPart(unreadableNote(attachment, "kind")));
      continue;
    }
    if (budget.text <= 0) {
      parts.push(textPart(unreadableNote(attachment, "budget")));
      continue;
    }
    const text = stored.text.slice(0, budget.text);
    budget.text -= text.length;
    parts.push(textPart(attachedFileBlock(attachment.name, text, stored.textTruncated || text.length < stored.text.length)));
  }
  return parts;
}

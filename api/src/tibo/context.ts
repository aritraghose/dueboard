// Building what the model sees for one turn (architecture.md §7.3). Built
// from scratch every turn, never from the whole history. Pure, so it can be
// tested and extended without the Durable Object.
//
// Sections, in order: the persona, the facts of right now, the today
// snapshot (`./snapshot.ts`), the story so far and relevant memories
// (`./recall.ts`), then the recent messages. Everything fits a token budget
// (`CONTEXT_BUDGET_TOKENS`): sections are capped where they're built, and
// the recent window drops its oldest messages (never below
// `MIN_RECENT_MESSAGES`) to fit what's left. Tools come on top.

import type { FilePart, ModelMessage, TextPart } from "ai";
import { fileLine } from "./attachment-rules.ts";
import { joinBubbles, reactionLine } from "./bubbles.ts";
import { CONTEXT_BUDGET_TOKENS, MIN_RECENT_MESSAGES, estimateTokens } from "./memory-rules.ts";
import { heldItem, type TiboConfirm, type TiboMessage, type TiboQuote, type TiboReceipt } from "./protocol.ts";

/** The user facts every turn needs, read from Postgres. */
export interface TiboProfile {
  readonly firstName: string;
  /** IANA zone. */
  readonly timeZone: string;
}

/** A titled block of the system prompt, such as a today snapshot or memories. */
export interface ContextSection {
  readonly title: string;
  readonly body: string;
}

export interface TurnInputs {
  readonly persona: string;
  readonly profile: TiboProfile;
  readonly now: Date;
  /** The latest messages, oldest first (`RECENT_WINDOW`). */
  readonly recent: readonly TiboMessage[];
  /** Added after the persona and the date, in order. */
  readonly sections?: readonly ContextSection[];
  /** Tokens for the system prompt and the messages together (`CONTEXT_BUDGET_TOKENS`). */
  readonly budget?: number;
  /**
   * What the memory jobs noted about a sent file, by id, so an older
   * message's files still say what was in them. `null`: no note (yet).
   */
  readonly fileNote?: (attachmentId: string) => string | null;
}

/** Estimated tokens per part of the context, logged in development to tune the budget. */
export interface ContextSizes {
  readonly persona: number;
  readonly sections: Readonly<Record<string, number>>;
  readonly recent: number;
  readonly recentMessages: number;
  /** Recent messages left out to stay in budget. */
  readonly dropped: number;
  readonly total: number;
}

export interface TurnContext {
  readonly system: string;
  readonly messages: ModelMessage[];
  readonly sizes: ContextSizes;
}

/** Messages of the thread the model sees verbatim. */
export const RECENT_WINDOW = 40;

/** "Tuesday, November 4, 2026, 2:05 PM" in the user's zone. */
export const formatNow = (now: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(now);

export const buildTurnContext = ({
  persona,
  profile,
  now,
  recent,
  sections = [],
  budget = CONTEXT_BUDGET_TOKENS,
  fileNote = () => null,
}: TurnInputs): TurnContext => {
  const facts: ContextSection = {
    title: "Right now",
    body: [
      `The user's first name is ${profile.firstName}.`,
      `It's ${formatNow(now, profile.timeZone)} for them (${profile.timeZone}).`,
    ].join("\n"),
  };
  const blocks = [facts, ...sections].map(({ title, body }) => ({ title, text: `## ${title}\n${body}` }));
  const system = [persona, ...blocks.map((block) => block.text)].join("\n\n");

  // The recent window gets what's left, newest messages first.
  const room = budget - estimateTokens(system);
  let window = recent;
  let messages = toModelMessages(window, fileNote);
  while (window.length > MIN_RECENT_MESSAGES && messageTokens(messages) > room) {
    window = window.slice(Math.min(Math.ceil(window.length * 0.1), window.length - MIN_RECENT_MESSAGES));
    messages = toModelMessages(window, fileNote);
  }
  const recentTokens = messageTokens(messages);
  return {
    system,
    messages,
    sizes: {
      persona: estimateTokens(persona),
      sections: Object.fromEntries(blocks.map((block) => [block.title, estimateTokens(block.text)])),
      recent: recentTokens,
      recentMessages: window.length,
      dropped: recent.length - window.length,
      total: estimateTokens(system) + recentTokens,
    },
  };
};

const messageTokens = (messages: readonly ModelMessage[]) =>
  messages.reduce((sum, message) => sum + estimateTokens(typeof message.content === "string" ? message.content : JSON.stringify(message.content)), 0);

/** How a reply's quote reads to the model ("you" is Tibo). */
const quoteLine = ({ role, body }: TiboQuote) =>
  `[Replying to ${role === "tibo" ? "your" : "my own"} earlier message: "${body.replace(/\s+/g, " ")}"]`;

const CONFIRM_NOTE: Record<TiboConfirm["status"], string> = {
  pending: "Waiting for the user's go-ahead (Confirm and Cancel buttons under your message)",
  confirmed: "The user confirmed",
  cancelled: "The user cancelled, so these didn't happen",
  expired: "Expired without an answer, so these didn't happen",
};

/**
 * What Tibo did in a turn, as an app note after its bubbles: the receipts
 * and any actions held for the user. `null` when the turn changed nothing.
 */
export const actionNote = (receipts: readonly TiboReceipt[] = [], confirm?: TiboConfirm): string | null => {
  const lines = [
    ...(receipts.length > 0
      ? [`Your actions: ${receipts.map((receipt) => (receipt.failed ? `${receipt.text} (failed)` : receipt.text)).join("; ")}.`]
      : []),
    ...(confirm ? [`${CONFIRM_NOTE[confirm.status]}: ${confirm.items.map((item) => heldItem(item).text).join("; ")}.`] : []),
  ];
  return lines.length > 0 ? lines.join("\n") : null;
};

/**
 * The thread as chat turns: a Tibo turn's bubbles become one assistant
 * message in the delimiter format (led by its reaction line if Tibo reacted
 * to the message before it), back-to-back user messages one user message,
 * and system events user-side notes the model can tell apart. A turn's
 * receipts and held actions follow it as such a note, so Tibo knows what it
 * did without being tempted to write receipts itself.
 */
export const toModelMessages = (
  recent: readonly TiboMessage[],
  fileNote: (attachmentId: string) => string | null = () => null,
): ModelMessage[] => {
  const out: { role: "user" | "assistant"; parts: string[]; turnId: string; reaction?: string }[] = [];
  let reaction: string | undefined;
  const rows = recent.flatMap((message): TiboMessage[] => {
    const note = message.role === "tibo" ? actionNote(message.receipts, message.confirm) : null;
    return note === null
      ? [message]
      : [message, { id: `${message.id}:actions`, turnId: `${message.id}:actions`, role: "system_event", body: note, createdAt: message.createdAt }];
  });
  for (const message of rows) {
    // Only Tibo's own reactions (on user messages) go back to the model; the
    // user's reactions to Tibo stay in the UI.
    if (message.role === "user") reaction = message.reaction;
    const role = message.role === "tibo" ? "assistant" : "user";
    const body =
      message.role === "system_event"
        ? `[App event, not written by the user] ${message.body}`
        : [
            ...(message.replyTo ? [quoteLine(message.replyTo)] : []),
            ...(message.body ? [message.body] : []),
            // Files read as lines naming them (and what was in them, once noted);
            // the newest ones' contents are added by `withFiles`.
            ...(message.attachments ?? []).map((attachment) => fileLine({ ...attachment, note: fileNote(attachment.id) })),
          ].join("\n");
    const last = out.at(-1);
    if (last && last.role === role && (role === "user" || last.turnId === message.turnId)) {
      last.parts.push(body);
    } else {
      out.push({ role, parts: [body], turnId: message.turnId, ...(role === "assistant" && reaction ? { reaction } : {}) });
      if (role === "assistant") reaction = undefined;
    }
  }
  // The model's window starts with a user turn.
  while (out[0]?.role === "assistant") out.shift();
  return out.map(({ role, parts, reaction: emoji }) =>
    role === "assistant"
      ? { role, content: [...(emoji ? [reactionLine(emoji)] : []), joinBubbles(parts)].join("\n") }
      : { role, content: parts.join("\n\n") },
  );
};

/**
 * The context with files added to its last message, the user's latest
 * (the files they just sent): the images and PDFs themselves, or a text
 * file's text. Added after the budget was worked out: files have their own
 * caps (`TURN_FILE_MAX_BYTES`, `TURN_FILE_TEXT_MAX_LENGTH`).
 */
export const withFiles = (messages: readonly ModelMessage[], parts: readonly (TextPart | FilePart)[]): ModelMessage[] => {
  const last = messages.at(-1);
  if (parts.length === 0 || !last || last.role !== "user") return [...messages];
  const text = typeof last.content === "string" ? [{ type: "text" as const, text: last.content }] : last.content;
  return [...messages.slice(0, -1), { role: "user", content: [...text, ...parts] }];
};

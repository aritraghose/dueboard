import type { FilePart, ModelMessage, TextPart } from "ai";
import { fileLine } from "./attachment-rules.ts";
import { joinBubbles, reactionLine } from "./bubbles.ts";
import { CONTEXT_BUDGET_TOKENS, MIN_RECENT_MESSAGES, estimateTokens } from "./memory-rules.ts";
import { imageRef } from "./image-rules.ts";
import {
  heldItem,
  type TiboAttachment,
  type TiboConfirm,
  type TiboMessage,
  type TiboQuote,
  type TiboReceipt,
} from "./protocol.ts";

export interface TiboProfile {
  readonly firstName: string;
  readonly timeZone: string;
}

export interface ContextSection {
  readonly title: string;
  readonly body: string;
}

export interface TurnInputs {
  readonly persona: string;
  readonly profile: TiboProfile;
  readonly now: Date;
  readonly recent: readonly TiboMessage[];
  readonly sections?: readonly ContextSection[];
  readonly budget?: number;
  readonly fileNote?: (attachmentId: string) => string | null;
}

export interface ContextSizes {
  readonly persona: number;
  readonly sections: Readonly<Record<string, number>>;
  readonly recent: number;
  readonly recentMessages: number;
  readonly dropped: number;
  readonly total: number;
}

export interface TurnContext {
  readonly system: string;
  readonly messages: ModelMessage[];
  readonly sizes: ContextSizes;
}

export const RECENT_WINDOW = 40;

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

const quoteLine = ({ role, body }: TiboQuote) =>
  `[Replying to ${role === "tibo" ? "your" : "my own"} earlier message: "${body.replace(/\s+/g, " ")}"]`;

const CONFIRM_NOTE: Record<TiboConfirm["status"], string> = {
  pending: "Waiting for the user's go-ahead (Confirm and Cancel buttons under your message)",
  confirmed: "The user confirmed",
  cancelled: "The user cancelled, so these didn't happen",
  expired: "Expired without an answer, so these didn't happen",
};

export const actionNote = (receipts: readonly TiboReceipt[] = [], confirm?: TiboConfirm): string | null => {
  const lines = [
    ...(receipts.length > 0
      ? [`Your actions: ${receipts.map((receipt) => (receipt.failed ? `${receipt.text} (failed)` : receipt.text)).join("; ")}.`]
      : []),
    ...(confirm ? [`${CONFIRM_NOTE[confirm.status]}: ${confirm.items.map((item) => heldItem(item).text).join("; ")}.`] : []),
  ];
  return lines.length > 0 ? lines.join("\n") : null;
};

export const madeImagesNote = (
  attachments: readonly TiboAttachment[],
  fileNote: (attachmentId: string) => string | null,
): string | null => {
  const lines = attachments.map((attachment) => {
    const prompt = fileNote(attachment.id);
    return `You sent a picture you made (ref ${imageRef(attachment.id)})${prompt ? `, from the prompt: "${prompt.replace(/\s+/g, " ").trim()}"` : ""}.`;
  });
  return lines.length > 0 ? lines.join("\n") : null;
};

export const toModelMessages = (
  recent: readonly TiboMessage[],
  fileNote: (attachmentId: string) => string | null = () => null,
): ModelMessage[] => {
  const out: { role: "user" | "assistant"; parts: string[]; turnId: string; reaction?: string }[] = [];
  let reaction: string | undefined;
  const rows = recent.flatMap((message): TiboMessage[] => {
    if (message.role !== "tibo") return [message];
    const appNote = (suffix: string, body: string): TiboMessage => ({
      id: `${message.id}:${suffix}`,
      turnId: `${message.id}:${suffix}`,
      role: "system_event",
      body,
      createdAt: message.createdAt,
    });
    const note = actionNote(message.receipts, message.confirm);
    const made = madeImagesNote(message.attachments ?? [], fileNote);
    const { attachments: _pictures, ...bubble } = message;
    return [
      ...(bubble.body ? [bubble] : []),
      ...(made ? [appNote("images", made)] : []),
      ...(note ? [appNote("actions", note)] : []),
    ];
  });
  for (const message of rows) {
    if (message.role === "user") reaction = message.reaction;
    const role = message.role === "tibo" ? "assistant" : "user";
    const body =
      message.role === "system_event"
        ? `[App event, not written by the user] ${message.body}`
        : [
            ...(message.replyTo ? [quoteLine(message.replyTo)] : []),
            ...(message.body ? [message.body] : []),
            ...(message.attachments ?? []).map((attachment) =>
              fileLine({ ...attachment, note: fileNote(attachment.id), ref: imageRef(attachment.id) }),
            ),
          ].join("\n");
    const last = out.at(-1);
    if (last && last.role === role && (role === "user" || last.turnId === message.turnId)) {
      last.parts.push(body);
    } else {
      out.push({ role, parts: [body], turnId: message.turnId, ...(role === "assistant" && reaction ? { reaction } : {}) });
      if (role === "assistant") reaction = undefined;
    }
  }
  while (out[0]?.role === "assistant") out.shift();
  return out.map(({ role, parts, reaction: emoji }) =>
    role === "assistant"
      ? { role, content: [...(emoji ? [reactionLine(emoji)] : []), joinBubbles(parts)].join("\n") }
      : { role, content: parts.join("\n\n") },
  );
};

export const withFiles = (messages: readonly ModelMessage[], parts: readonly (TextPart | FilePart)[]): ModelMessage[] => {
  const last = messages.at(-1);
  if (parts.length === 0 || !last || last.role !== "user") return [...messages];
  const text = typeof last.content === "string" ? [{ type: "text" as const, text: last.content }] : last.content;
  return [...messages.slice(0, -1), { role: "user", content: [...text, ...parts] }];
};

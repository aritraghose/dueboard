// Building what the model sees for one turn (architecture.md §7.3). Built
// from scratch every turn, never from the whole history. Pure, so it can be
// tested and extended without the Durable Object.
//
// Extension points:
// - Step 18 added the today snapshot (`./snapshot.ts`) as a `section`.
// - Step 19 adds "story so far" summaries and relevant memories as more
//   `sections`, and may shorten `recent`.

import type { ModelMessage } from "ai";
import { joinBubbles, reactionLine } from "./bubbles.ts";
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
}

export interface TurnContext {
  readonly system: string;
  readonly messages: ModelMessage[];
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
}: TurnInputs): TurnContext => {
  const facts: ContextSection = {
    title: "Right now",
    body: [
      `The user's first name is ${profile.firstName}.`,
      `It's ${formatNow(now, profile.timeZone)} for them (${profile.timeZone}).`,
    ].join("\n"),
  };
  const system = [persona, ...[facts, ...sections].map(({ title, body }) => `## ${title}\n${body}`)].join(
    "\n\n",
  );
  return { system, messages: toModelMessages(recent) };
};

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
export const toModelMessages = (recent: readonly TiboMessage[]): ModelMessage[] => {
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
        : message.replyTo
          ? `${quoteLine(message.replyTo)}\n${message.body}`
          : message.body;
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

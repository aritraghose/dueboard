// Building what the model sees for one turn (architecture.md §7.3). Built
// from scratch every turn, never from the whole history. Pure, so it can be
// tested and extended without the Durable Object.
//
// Extension points:
// - Step 18 adds the today snapshot as a `section`, and its tools go next to
//   this in `TiboAgent.modelCall` (the persona's `NO_TOOLS_YET` line goes).
// - Step 19 adds "story so far" summaries and relevant memories as more
//   `sections`, and may shorten `recent`.

import type { ModelMessage } from "ai";
import { joinBubbles, reactionLine } from "./bubbles.ts";
import type { TiboMessage, TiboQuote } from "./protocol.ts";

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

/**
 * The thread as chat turns: a Tibo turn's bubbles become one assistant
 * message in the delimiter format (led by its reaction line if Tibo reacted
 * to the message before it), back-to-back user messages one user message,
 * and system events user-side notes the model can tell apart.
 */
export const toModelMessages = (recent: readonly TiboMessage[]): ModelMessage[] => {
  const out: { role: "user" | "assistant"; parts: string[]; turnId: string; reaction?: string }[] = [];
  let reaction: string | undefined;
  for (const message of recent) {
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

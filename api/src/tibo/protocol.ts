// Tibo's WebSocket protocol (architecture.md §7): the frames between the
// browser's `TiboThread` and the `TiboAgent` Durable Object, as JSON text.
// Plain types and constants with no imports, so the browser can use them
// (`@dueboard/api/tibo`). The Agents SDK's own frames (`cf_agent_*`, `rpc`)
// share the socket; `useAgent` consumes those before ours arrive.

/** Who wrote a row. `system_event` rows (relays, proactive triggers) come in later steps. */
export type TiboRole = "user" | "tibo" | "system_event";

/** One row of the thread: a user message, or one of Tibo's bubbles. */
export interface TiboMessage {
  readonly id: string;
  /** The turn a Tibo bubble belongs to; a user message's own id for theirs. */
  readonly turnId: string;
  readonly role: TiboRole;
  readonly body: string;
  /** Milliseconds since the epoch. */
  readonly createdAt: number;
  /** The browser's id for a message it sent, so it can swap its optimistic copy. */
  readonly clientId?: string;
  /**
   * The other side's reaction: Tibo's on a message of the user's (Tibo
   * picks when), the user's on one of Tibo's (never shown to the model).
   */
  readonly reaction?: string;
  /** A user message Tibo has read (its turn started). */
  readonly seen?: boolean;
  /** The message this one replies to, as it was when quoted. */
  readonly replyTo?: TiboQuote;
}

/** A quoted message: who wrote it and the start of its text. */
export interface TiboQuote {
  readonly id: string;
  readonly role: TiboRole;
  readonly body: string;
}

/** Client → agent. */
export type TiboClientFrame =
  | {
      readonly type: "send";
      readonly text: string;
      readonly clientId: string;
      /** Replying to this message (swipe to reply). */
      readonly replyTo?: string;
    }
  | { readonly type: "loadOlder"; readonly beforeId: string }
  /** The user reacts to one of Tibo's messages; `null` takes the reaction back. */
  | { readonly type: "react"; readonly messageId: string; readonly emoji: string | null };

/** Agent → client. Broadcast to every tab of the user unless noted. */
export type TiboServerFrame =
  /** The latest messages, oldest first. Sent to a socket when it connects. */
  | { readonly type: "history"; readonly messages: readonly TiboMessage[]; readonly hasMore: boolean }
  /** An answer to `loadOlder`, to that socket only; oldest first. */
  | { readonly type: "older"; readonly messages: readonly TiboMessage[]; readonly hasMore: boolean }
  /** Tibo is (or stopped) typing the next bubble. */
  | { readonly type: "typing"; readonly on: boolean }
  /** A stored message: the user's (echoed to every tab) or one of Tibo's bubbles. */
  | { readonly type: "bubble"; readonly message: TiboMessage }
  /** A reaction changed: Tibo's on a user message, or the user's on Tibo's (`null`: removed). */
  | { readonly type: "reaction"; readonly messageId: string; readonly emoji: string | null }
  /** Tibo read these user messages. */
  | { readonly type: "seen"; readonly messageIds: readonly string[] }
  /** Tibo finished replying, whatever the outcome. */
  | { readonly type: "turnDone"; readonly turnId: string }
  /** Messages left this month, after a turn was charged. */
  | { readonly type: "usage"; readonly remaining: number; readonly limit: number }
  /** Out of AI messages: no reply this time. The UI shows its own notice; nothing is stored. */
  | { readonly type: "limitReached"; readonly limit: number }
  /**
   * Something went wrong. `bubble` is a Tibo-voiced line to show in the
   * thread (never stored); `message` is plain text for a toast or alert.
   */
  | { readonly type: "error"; readonly message: string; readonly bubble?: string };

/** The agent's route name: `/agents/tibo-agent/<user id>`. */
export const TIBO_AGENT = "tibo-agent";
/** Messages in `history` on connect. */
export const TIBO_HISTORY_PAGE = 50;
/** Messages per `older` page. */
export const TIBO_OLDER_PAGE = 50;
/** Most bubbles in one Tibo turn; anything past it joins the last one. */
export const TIBO_MAX_BUBBLES = 5;
/** Reactions the user can pick for Tibo's messages. */
export const TIBO_QUICK_REACTIONS = ["❤️", "😂", "👍", "😮", "😢", "🙏"] as const;
/** The longest quote kept with a reply, in characters. */
export const TIBO_QUOTE_LENGTH = 280;
/** Below this many messages left, the composer says how many. */
export const TIBO_LOW_USAGE = 30;

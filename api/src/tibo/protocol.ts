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
  /** What Tibo did during this turn, shown under the turn's last bubble. */
  readonly receipts?: readonly TiboReceipt[];
  /** Actions Tibo is holding for the user's go-ahead, on the turn's last bubble. */
  readonly confirm?: TiboConfirm;
}

/** What a receipt or a held action is about, so the app can show the item's own card. */
export type TiboItemKind = "task" | "habit" | "goal" | "note" | "session" | "tag";

export interface TiboItemRef {
  readonly kind: TiboItemKind;
  readonly id: string;
  /** Its name when Tibo acted (the only name left once it's deleted). */
  readonly title?: string;
}

/** One thing Tibo did: "Created task: Call mom · Tomorrow". */
export interface TiboReceipt {
  readonly text: string;
  /** What happened, in a word or two: "Created", "Checked in", "Deleted". */
  readonly verb?: string;
  readonly item?: TiboItemRef;
  /** It was tried and failed (only after a confirmation; the reply explains other failures). */
  readonly failed?: boolean;
}

/** One held action: "Delete task: Gym", and the item it's about. */
export interface TiboHeldItem {
  readonly text: string;
  readonly item?: TiboItemRef;
}

/**
 * Destructive or surprising actions waiting for the user (deleting, stopping
 * or replacing a session, more than three changes in one reply, making
 * something public). One at a time: a newer one expires the older.
 */
export interface TiboConfirm {
  readonly actionId: string;
  /** One per held action. Plain strings in threads from before items were added. */
  readonly items: readonly (TiboHeldItem | string)[];
  readonly status: TiboConfirmStatus;
}

/** A held action, whichever shape it was stored in. */
export const heldItem = (item: TiboHeldItem | string): TiboHeldItem =>
  typeof item === "string" ? { text: item } : item;

export type TiboConfirmStatus = "pending" | "confirmed" | "cancelled" | "expired";

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
  | { readonly type: "react"; readonly messageId: string; readonly emoji: string | null }
  /** The user's answer to a `confirm` on one of Tibo's bubbles. */
  | { readonly type: "confirm"; readonly actionId: string; readonly approve: boolean };

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
  /** A stored message changed (its receipts or confirmation): replace it. */
  | { readonly type: "updated"; readonly message: TiboMessage }
  /**
   * Tibo changed the user's data: the reactivity keys whose lists the app
   * should load again ("tasks", "habits", …).
   */
  | { readonly type: "changed"; readonly keys: readonly string[] }
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
/** How long Tibo holds actions for the user's go-ahead, in ms. */
export const TIBO_CONFIRM_TTL_MS = 30 * 60 * 1000;
/** The longest quote kept with a reply, in characters. */
export const TIBO_QUOTE_LENGTH = 280;
/** Below this many messages left, the composer says how many. */
export const TIBO_LOW_USAGE = 30;

// ─── Long-term memory (Settings → Tibo → Memory) ───────────────────────────

/** What a memory is about. */
export const TIBO_MEMORY_KINDS = ["fact", "preference", "person", "event", "plan"] as const;
export type TiboMemoryKind = (typeof TIBO_MEMORY_KINDS)[number];

/** A lasting fact Tibo keeps about the user, as Settings lists it. */
export interface TiboMemory {
  readonly id: string;
  readonly text: string;
  readonly kind: TiboMemoryKind;
  /** Milliseconds since the epoch. */
  readonly createdAt: number;
  readonly updatedAt: number;
}

/**
 * The agent's HTTP routes for Settings, under `/agents/tibo-agent/<name>/`
 * (the web stack's proxy pins `<name>` to the signed-in user):
 * `GET memories` → `{ memories: TiboMemory[] }`, newest learned first;
 * `DELETE memories/<id>` → `{ ok: true }`, or 404.
 */
export const TIBO_MEMORIES_PATH = "memories";
/** Most memories `GET memories` returns. */
export const TIBO_MEMORIES_LIMIT = 500;

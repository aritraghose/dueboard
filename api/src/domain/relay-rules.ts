import {
  RELAY_OPEN_PER_PAIR,
  RELAY_OPEN_PER_RECIPIENT,
  RELAY_OPEN_STATUS,
  RELAY_TTL_MS,
  RELAYS_PER_DAY,
  type RelayStatus,
} from "./relay-constants.ts";
import type { RelayPolicy, RelayRefusal } from "./model.ts";

// Pure rules for Tibo relays (`./relays.ts`, architecture.md §7.5).

/** What decides whether a relay may go from the sender to the recipient. */
export interface RelayFacts {
  readonly self: boolean;
  /** The sender blocked the recipient. */
  readonly senderBlocked: boolean;
  /** The recipient blocked the sender. */
  readonly recipientBlocked: boolean;
  /** The recipient's `relay_policy`. */
  readonly policy: RelayPolicy;
  readonly connected: boolean;
}

/**
 * Whether the relay may be sent. Someone who blocked the sender looks like
 * no one (`not_found`), as everywhere else in the app; a block the sender
 * made is theirs to lift.
 */
export const relayDecision = (facts: RelayFacts): RelayRefusal | "not_found" | null => {
  if (facts.self) return "self";
  if (facts.recipientBlocked) return "not_found";
  if (facts.senderBlocked) return "blocked";
  if (facts.policy === "none") return "policy_none";
  if (facts.policy === "connections" && !facts.connected) return "connections_only";
  return null;
};

/** The sentence for a refusal, as Tibo will pass it on. */
export const refusalMessage = (reason: RelayRefusal, username: string): string => {
  const who = `@${username}`;
  switch (reason) {
    case "self":
      return "That's the user themself.";
    case "blocked":
      return `The user blocked ${who}. They'd need to unblock them first.`;
    case "policy_none":
      return `${who} doesn't take messages through Tibo.`;
    case "connections_only":
      return `${who} only takes messages through Tibo from their connections.`;
    case "out_of_messages":
      return "The user is out of AI messages this month, so their Tibo can't pass messages on until it resets.";
    case "unavailable":
      return `${who} can't take messages through Tibo right now. Try again later.`;
  }
};

/** What the caps count, for one sender and recipient. */
export interface RelayCounts {
  /** Relays the sender sent in the last 24 hours. */
  readonly sentToday: number;
  /** Open relays from the sender to this recipient. */
  readonly openToPair: number;
  /** Open relays waiting on the recipient, from anyone. */
  readonly openForRecipient: number;
}

/** Why the caps refuse another relay, or `null`. */
export const relayCapMessage = (counts: RelayCounts, username: string): string | null => {
  if (counts.sentToday >= RELAYS_PER_DAY) {
    return `The user can send up to ${RELAYS_PER_DAY} messages through Tibo a day. Try again tomorrow.`;
  }
  if (counts.openToPair >= RELAY_OPEN_PER_PAIR) {
    return `${RELAY_OPEN_PER_PAIR} messages to @${username} are already waiting for an answer. Wait for one to come back.`;
  }
  if (counts.openForRecipient >= RELAY_OPEN_PER_RECIPIENT) {
    return `@${username} has too many messages waiting right now. Try again later.`;
  }
  return null;
};

/** When a relay sent at `createdAt` expires. */
export const expiresAtFor = (createdAt: Date): Date => new Date(createdAt.getTime() + RELAY_TTL_MS);

/** Whether a relay can still be delivered, answered or declined. */
export const isOpen = (status: RelayStatus): boolean => (RELAY_OPEN_STATUS as readonly RelayStatus[]).includes(status);

/**
 * Which sides' agents still have to hear that a relay moved from `previous`
 * to `next`. An answer or a decline was the recipient's own doing, so only
 * the sender is told; an expiry tells the sender, and the recipient too if
 * their Tibo already showed it.
 */
export const syncAfter = (
  previous: RelayStatus,
  next: "delivered" | "answered" | "declined" | "expired",
): { readonly senderSynced: boolean; readonly recipientSynced: boolean } => {
  switch (next) {
    case "delivered":
      return { senderSynced: true, recipientSynced: true };
    case "answered":
    case "declined":
      return { senderSynced: false, recipientSynced: true };
    case "expired":
      return { senderSynced: false, recipientSynced: previous !== "delivered" };
  }
};

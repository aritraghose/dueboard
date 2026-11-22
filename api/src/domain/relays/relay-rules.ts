import {
  RELAY_OPEN_PER_PAIR,
  RELAY_OPEN_PER_RECIPIENT,
  RELAY_OPEN_STATUS,
  RELAY_TTL_MS,
  RELAYS_PER_DAY,
  type RelayStatus,
} from "./relay-constants.ts";
import type { RelayPolicy, RelayRefusal } from "./model.ts";

export interface RelayFacts {
  readonly self: boolean;
  readonly senderBlocked: boolean;
  readonly recipientBlocked: boolean;
  readonly policy: RelayPolicy;
  readonly connected: boolean;
}

export const relayDecision = (facts: RelayFacts): RelayRefusal | "not_found" | null => {
  if (facts.self) return "self";
  if (facts.recipientBlocked) return "not_found";
  if (facts.senderBlocked) return "blocked";
  if (facts.policy === "none") return "policy_none";
  if (facts.policy === "connections" && !facts.connected) return "connections_only";
  return null;
};

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

export interface RelayCounts {
  readonly sentToday: number;
  readonly openToPair: number;
  readonly openForRecipient: number;
}

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

export const expiresAtFor = (createdAt: Date): Date => new Date(createdAt.getTime() + RELAY_TTL_MS);

export const isOpen = (status: RelayStatus): boolean => (RELAY_OPEN_STATUS as readonly RelayStatus[]).includes(status);

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

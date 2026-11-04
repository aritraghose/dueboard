import { describe, expect, test } from "bun:test";
import { RELAY_OPEN_PER_PAIR, RELAY_OPEN_PER_RECIPIENT, RELAY_TTL_MS, RELAYS_PER_DAY } from "./relay-constants.ts";
import { expiresAtFor, isOpen, relayCapMessage, relayDecision, syncAfter, type RelayFacts } from "./relay-rules.ts";

const facts = (overrides: Partial<RelayFacts> = {}): RelayFacts => ({
  self: false,
  senderBlocked: false,
  recipientBlocked: false,
  policy: "connections",
  connected: true,
  ...overrides,
});

describe("relayDecision", () => {
  test("connections (the default) takes relays from connections only", () => {
    expect(relayDecision(facts())).toBeNull();
    expect(relayDecision(facts({ connected: false }))).toBe("connections_only");
  });

  test("anyone takes strangers; none takes no one, connections included", () => {
    expect(relayDecision(facts({ policy: "anyone", connected: false }))).toBeNull();
    expect(relayDecision(facts({ policy: "none" }))).toBe("policy_none");
  });

  test("someone who blocked the sender looks like no one, whatever their policy", () => {
    expect(relayDecision(facts({ recipientBlocked: true, policy: "anyone" }))).toBe("not_found");
  });

  test("a block the sender made is theirs to lift", () => {
    expect(relayDecision(facts({ senderBlocked: true, policy: "anyone" }))).toBe("blocked");
  });

  test("never to yourself", () => {
    expect(relayDecision(facts({ self: true, policy: "anyone" }))).toBe("self");
  });
});

describe("relayCapMessage", () => {
  const counts = { sentToday: 0, openToPair: 0, openForRecipient: 0 };

  test("under every cap", () => {
    expect(relayCapMessage(counts, "bea")).toBeNull();
    expect(
      relayCapMessage(
        { sentToday: RELAYS_PER_DAY - 1, openToPair: RELAY_OPEN_PER_PAIR - 1, openForRecipient: RELAY_OPEN_PER_RECIPIENT - 1 },
        "bea",
      ),
    ).toBeNull();
  });

  test("the daily cap, the pair cap and the recipient's waiting cap", () => {
    expect(relayCapMessage({ ...counts, sentToday: RELAYS_PER_DAY }, "bea")).toContain(`${RELAYS_PER_DAY}`);
    expect(relayCapMessage({ ...counts, openToPair: RELAY_OPEN_PER_PAIR }, "bea")).toContain("@bea");
    expect(relayCapMessage({ ...counts, openForRecipient: RELAY_OPEN_PER_RECIPIENT }, "bea")).toContain("too many");
  });
});

describe("lifecycle", () => {
  test("a relay expires a week after it's sent", () => {
    const sent = new Date("2026-11-04T10:00:00Z");
    expect(expiresAtFor(sent).getTime() - sent.getTime()).toBe(RELAY_TTL_MS);
    expect(expiresAtFor(sent).toISOString()).toBe("2026-11-11T10:00:00.000Z");
  });

  test("only pending and delivered relays are open", () => {
    expect(isOpen("pending")).toBe(true);
    expect(isOpen("delivered")).toBe(true);
    for (const status of ["answered", "declined", "expired", "cancelled"] as const) expect(isOpen(status)).toBe(false);
  });

  test("an answer or a decline is owed to the sender only", () => {
    expect(syncAfter("delivered", "answered")).toEqual({ senderSynced: false, recipientSynced: true });
    expect(syncAfter("delivered", "declined")).toEqual({ senderSynced: false, recipientSynced: true });
  });

  test("an expiry is owed to the sender, and to the recipient only if their Tibo showed it", () => {
    expect(syncAfter("delivered", "expired")).toEqual({ senderSynced: false, recipientSynced: false });
    expect(syncAfter("pending", "expired")).toEqual({ senderSynced: false, recipientSynced: true });
  });

  test("a delivery leaves nothing owed", () => {
    expect(syncAfter("pending", "delivered")).toEqual({ senderSynced: true, recipientSynced: true });
  });
});

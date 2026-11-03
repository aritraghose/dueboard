import { describe, expect, test } from "bun:test";
import type { Privacy } from "./model.ts";
import {
  canSeeItem,
  canSeeOnLive,
  liveDisplay,
  relationOf,
  visiblePrivacies,
  type LiveDisplay,
  type Relationship,
  type ViewerRelation,
} from "./visibility-rules.ts";

const OWNER = "owner";

/** Every kind of viewer, as (viewer id, relationship to `OWNER`). */
const VIEWERS: Record<string, { viewerId: string | null; relationship: Relationship; relation: ViewerRelation }> = {
  "logged out": { viewerId: null, relationship: { connected: false, blocked: false }, relation: "other" },
  self: { viewerId: OWNER, relationship: { connected: false, blocked: false }, relation: "self" },
  connection: { viewerId: "friend", relationship: { connected: true, blocked: false }, relation: "connected" },
  stranger: { viewerId: "stranger", relationship: { connected: false, blocked: false }, relation: "other" },
  blocked: { viewerId: "foe", relationship: { connected: false, blocked: true }, relation: "blocked" },
  // A block removes the connection, but if both were ever true the block wins.
  "blocked connection": { viewerId: "foe", relationship: { connected: true, blocked: true }, relation: "blocked" },
};

type Viewer = keyof typeof VIEWERS;

/** `canSeeItem` for each viewer: public, connections, private. */
const CAN_SEE: Record<Viewer, Record<Privacy, boolean>> = {
  "logged out": { public: true, connections: false, private: false },
  self: { public: true, connections: true, private: true },
  connection: { public: true, connections: true, private: false },
  stranger: { public: true, connections: false, private: false },
  blocked: { public: false, connections: false, private: false },
  "blocked connection": { public: false, connections: false, private: false },
};

/** What Live shows each viewer, by privacy, for an item shared to Live (`null`: nothing). */
const LIVE: Record<Viewer, Record<Privacy, LiveDisplay | null>> = {
  "logged out": { public: null, connections: null, private: null },
  self: { public: "full", connections: "full", private: "full" },
  connection: { public: "full", connections: "full", private: "redacted" },
  stranger: { public: null, connections: null, private: null },
  blocked: { public: null, connections: null, private: null },
  "blocked connection": { public: null, connections: null, private: null },
};

const PRIVACIES: readonly Privacy[] = ["public", "connections", "private"];
const viewers = Object.keys(VIEWERS) as Viewer[];

describe("relationOf", () => {
  for (const name of viewers) {
    const { viewerId, relationship, relation } = VIEWERS[name]!;
    test(`${name} → ${relation}`, () => {
      expect(relationOf(viewerId, OWNER, relationship)).toBe(relation);
    });
  }

  test("a logged-out visitor is never treated as the owner", () => {
    expect(relationOf(null, OWNER, { connected: true, blocked: true })).toBe("other");
  });
});

describe("canSeeItem", () => {
  for (const name of viewers) {
    for (const privacy of PRIVACIES) {
      const expected = CAN_SEE[name][privacy];
      test(`${name}, ${privacy} → ${expected ? "sees it" : "doesn't"}`, () => {
        const { viewerId, relationship } = VIEWERS[name]!;
        expect(canSeeItem(viewerId, OWNER, privacy, relationship)).toBe(expected);
      });
    }
  }

  test("matches visiblePrivacies for every relation", () => {
    for (const name of viewers) {
      const { relation } = VIEWERS[name]!;
      const seen = PRIVACIES.filter((p) => CAN_SEE[name][p]);
      expect([...visiblePrivacies(relation)]).toEqual(seen);
    }
  });
});

describe("Live", () => {
  for (const name of viewers) {
    for (const privacy of PRIVACIES) {
      for (const shareToLive of [true, false]) {
        const expected = shareToLive ? LIVE[name][privacy] : null;
        test(`${name}, ${privacy}, share ${shareToLive ? "on" : "off"} → ${expected ?? "hidden"}`, () => {
          const { viewerId, relationship } = VIEWERS[name]!;
          const shown = canSeeOnLive(viewerId, OWNER, shareToLive, relationship);
          expect(shown ? liveDisplay(viewerId!, OWNER, privacy) : null).toBe(expected);
        });
      }
    }
  }

  test("Live never shows what the viewer couldn't otherwise know exists, beyond the redacted line", () => {
    for (const name of viewers) {
      for (const privacy of PRIVACIES) {
        if (LIVE[name][privacy] === "full") expect(CAN_SEE[name][privacy]).toBe(true);
      }
    }
  });
});

import { describe, expect, test } from "bun:test";
import {
  connectionState,
  normalizeUsername,
  orderedPair,
  searchPatterns,
  type PairFacts,
} from "./social-rules.ts";

const none: PairFacts = {
  self: false,
  viewerBlocked: false,
  connected: false,
  pendingOut: false,
  pendingIn: false,
};

describe("orderedPair", () => {
  test("puts the smaller id first either way round", () => {
    expect(orderedPair("b", "a")).toEqual(["a", "b"]);
    expect(orderedPair("a", "b")).toEqual(["a", "b"]);
  });

  test("compares by code unit, so uppercase sorts before lowercase", () => {
    expect(orderedPair("a1", "Z9")).toEqual(["Z9", "a1"]);
  });
});

describe("normalizeUsername", () => {
  test("drops a leading @, trims and lowercases", () => {
    expect(normalizeUsername("  @Ar1tra ")).toBe("ar1tra");
    expect(normalizeUsername("some.one_2")).toBe("some.one_2");
  });

  test("refuses what can't be a username", () => {
    expect(normalizeUsername("ab")).toBeNull();
    expect(normalizeUsername("a".repeat(31))).toBeNull();
    expect(normalizeUsername("no spaces")).toBeNull();
    expect(normalizeUsername("percent%")).toBeNull();
    expect(normalizeUsername("@@twice")).toBeNull();
  });
});

describe("searchPatterns", () => {
  test("a username prefix with underscores escaped, and a name match", () => {
    expect(searchPatterns("@Ar")).toEqual({ exact: "ar", username: "ar%", name: "%@Ar%" });
    expect(searchPatterns("a_b")?.username).toBe("a\\_b%");
  });

  test("full names match by name only, spaces collapsed", () => {
    expect(searchPatterns("  Aritra   Ghose ")).toEqual({
      exact: "aritra ghose",
      username: null,
      name: "%Aritra Ghose%",
    });
  });

  test("name wildcards are escaped", () => {
    expect(searchPatterns("50%")?.name).toBe("%50\\%%");
  });

  test("needs two characters", () => {
    expect(searchPatterns("a")).toBeNull();
    expect(searchPatterns("@a")).toBeNull();
    expect(searchPatterns("   ")).toBeNull();
  });
});

describe("connectionState", () => {
  test("none by default", () => {
    expect(connectionState(none)).toBe("none");
  });

  test("self wins", () => {
    expect(connectionState({ ...none, self: true, connected: true })).toBe("self");
  });

  test("a block by the viewer wins over a connection and requests", () => {
    expect(
      connectionState({ ...none, viewerBlocked: true, connected: true, pendingIn: true }),
    ).toBe("blocked");
  });

  test("connected wins over stray requests", () => {
    expect(connectionState({ ...none, connected: true, pendingOut: true })).toBe("connected");
  });

  test("an incoming request wins over an outgoing one", () => {
    expect(connectionState({ ...none, pendingIn: true, pendingOut: true })).toBe("pending_in");
    expect(connectionState({ ...none, pendingOut: true })).toBe("pending_out");
  });
});

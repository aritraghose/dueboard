import { describe, expect, test } from "bun:test";
import { askInstanceName, askUsername, parseAskInstanceName, parseVisitorCookie } from "./protocol.ts";

const uuid = "3f2b8c1e-9a4d-4f6b-8e2a-1c5d7e9f0a3b";

describe("Ask instance names", () => {
  test("round-trip for signed-in and logged-out visitors", () => {
    const user = askInstanceName("bea", { kind: "user", id: "AbC_12-x" });
    expect(user).toBe("bea~u.AbC_12-x");
    expect(parseAskInstanceName(user)).toEqual({ username: "bea", visitor: { kind: "user", id: "AbC_12-x" } });
    const anon = askInstanceName("bea.k", { kind: "anon", id: uuid });
    expect(parseAskInstanceName(anon)).toEqual({ username: "bea.k", visitor: { kind: "anon", id: uuid } });
  });

  test("refuse names the proxy wouldn't make", () => {
    expect(parseAskInstanceName("bea")).toBeNull();
    expect(parseAskInstanceName("Bea~u.x")).toBeNull();
    expect(parseAskInstanceName("bea~v.not-a-uuid")).toBeNull();
    expect(parseAskInstanceName("bea~u.a/b")).toBeNull();
    expect(parseAskInstanceName("bea~x.abc")).toBeNull();
  });

  test("usernames from the URL are normalized or refused", () => {
    expect(askUsername("@Bea")).toBe("bea");
    expect(askUsername("be")).toBeNull();
    expect(askUsername("bea~u.x")).toBeNull();
  });

  test("only cookie values we issue are accepted", () => {
    expect(parseVisitorCookie(uuid)).toBe(uuid);
    expect(parseVisitorCookie("anything")).toBeNull();
    expect(parseVisitorCookie(undefined)).toBeNull();
  });
});

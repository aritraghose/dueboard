import { describe, expect, test } from "bun:test";
import { isValidUsername, usernameProblem } from "./username-rules.ts";

describe("usernameProblem", () => {
  test("accepts 4–15 letters, numbers and underscores, any case", () => {
    expect(usernameProblem("ar1tra")).toBeNull();
    expect(usernameProblem("Some_One_2")).toBeNull();
    expect(usernameProblem("abcd")).toBeNull();
    expect(usernameProblem("a".repeat(15))).toBeNull();
    expect(usernameProblem("1234")).toBeNull();
  });

  test("names what's wrong", () => {
    expect(usernameProblem("abc")).toBe("too_short");
    expect(usernameProblem("a".repeat(16))).toBe("too_long");
    expect(usernameProblem("some.one")).toBe("dot");
    expect(usernameProblem("some one")).toBe("space");
    expect(usernameProblem("some-one")).toBe("character");
    expect(usernameProblem("émile")).toBe("character");
  });

  test("keeps the app's own names and staff-sounding ones", () => {
    expect(usernameProblem("Tibo")).toBe("tibo");
    expect(usernameProblem("tibo_fan")).toBeNull();
    expect(usernameProblem("DueboardHQ")).toBe("reserved");
    expect(usernameProblem("the_admin")).toBe("reserved");
  });

  test("isValidUsername agrees", () => {
    expect(isValidUsername("ar1tra")).toBe(true);
    expect(isValidUsername("a.b.c.d")).toBe(false);
  });
});

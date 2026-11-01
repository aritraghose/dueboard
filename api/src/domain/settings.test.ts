import { describe, expect, test } from "bun:test";
import { USER_COLOR } from "./model.ts";
import { randomUserColor } from "./settings.ts";

describe("randomUserColor", () => {
  test("picks every palette color except gray", () => {
    const seen = new Set(Array.from({ length: 2000 }, randomUserColor));
    expect([...seen].sort()).toEqual([...USER_COLOR].sort());
    expect(seen.has("gray" as never)).toBe(false);
  });
});

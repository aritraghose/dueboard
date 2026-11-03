import { describe, expect, test } from "bun:test";
import { toModelMessages } from "./context.ts";
import type { TiboMessage } from "./protocol.ts";

const message = (patch: Partial<TiboMessage> & Pick<TiboMessage, "id" | "role" | "body">): TiboMessage => ({
  turnId: patch.id,
  createdAt: 0,
  ...patch,
});

describe("toModelMessages", () => {
  test("a Tibo turn's bubbles are one assistant message", () => {
    expect(
      toModelMessages([
        message({ id: "u1", role: "user", body: "hi" }),
        message({ id: "t1", turnId: "turn", role: "tibo", body: "Hey!" }),
        message({ id: "t2", turnId: "turn", role: "tibo", body: "What's up?" }),
      ]),
    ).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "Hey!\n---\nWhat's up?" },
    ]);
  });

  test("a reply carries its quote", () => {
    const [, , reply] = toModelMessages([
      message({ id: "u1", role: "user", body: "hi" }),
      message({ id: "t1", role: "tibo", body: "Start with the data." }),
      message({
        id: "u2",
        role: "user",
        body: "why?",
        replyTo: { id: "t1", role: "tibo", body: "Start with the data." },
      }),
    ]);
    expect(reply).toEqual({
      role: "user",
      content: '[Replying to your earlier message: "Start with the data."]\nwhy?',
    });
  });

  test("Tibo's reactions are replayed; the user's reactions are not", () => {
    expect(
      toModelMessages([
        message({ id: "u1", role: "user", body: "I passed!", reaction: "🎉" }),
        message({ id: "t1", role: "tibo", body: "Legend.", reaction: "❤️" }),
        message({ id: "u2", role: "user", body: "thanks" }),
      ]),
    ).toEqual([
      { role: "user", content: "I passed!" },
      { role: "assistant", content: "[react: 🎉]\nLegend." },
      { role: "user", content: "thanks" },
    ]);
  });
});

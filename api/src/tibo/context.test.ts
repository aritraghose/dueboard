import { describe, expect, test } from "bun:test";
import { actionNote, toModelMessages } from "./context.ts";
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

describe("actions in the replay", () => {
  test("a turn's receipts follow it as an app note, not as Tibo's own words", () => {
    expect(
      toModelMessages([
        message({ id: "u1", role: "user", body: "add call mom tomorrow" }),
        message({
          id: "t1",
          turnId: "turn",
          role: "tibo",
          body: "Done!",
          receipts: [{ text: "Created task: Call mom · Tomorrow" }],
        }),
        message({ id: "u2", role: "user", body: "thanks" }),
      ]),
    ).toEqual([
      { role: "user", content: "add call mom tomorrow" },
      { role: "assistant", content: "Done!" },
      {
        role: "user",
        content:
          "[App event, not written by the user] Your actions: Created task: Call mom · Tomorrow.\n\nthanks",
      },
    ]);
  });

  test("held actions say whether they're waiting, confirmed, cancelled or expired", () => {
    const items = ["Delete task: Gym"];
    expect(actionNote([], { actionId: "a", items, status: "pending" })).toBe(
      "Waiting for the user's go-ahead (Confirm and Cancel buttons under your message): Delete task: Gym.",
    );
    expect(actionNote([{ text: "Deleted task: Gym" }], { actionId: "a", items, status: "confirmed" })).toBe(
      "Your actions: Deleted task: Gym.\nThe user confirmed: Delete task: Gym.",
    );
    expect(actionNote([], { actionId: "a", items, status: "cancelled" })).toContain("didn't happen");
    expect(actionNote([{ text: "Stop it: no session", failed: true }])).toBe("Your actions: Stop it: no session (failed).");
    expect(actionNote()).toBeNull();
  });
});

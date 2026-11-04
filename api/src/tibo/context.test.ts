import { describe, expect, test } from "bun:test";
import { actionNote, buildTurnContext, toModelMessages } from "./context.ts";
import { MIN_RECENT_MESSAGES } from "./memory-rules.ts";
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

describe("buildTurnContext's budget", () => {
  const profile = { firstName: "Sam", timeZone: "UTC" };
  const now = new Date("2026-11-04T12:00:00Z");
  const thread = Array.from({ length: 40 }, (_, index) =>
    message({ id: `m${index}`, role: index % 2 === 0 ? "user" : "tibo", body: "x".repeat(400) }),
  );

  test("everything fits: nothing dropped, sizes per section", () => {
    const context = buildTurnContext({
      persona: "persona",
      profile,
      now,
      recent: thread.slice(-4),
      sections: [{ title: "The story so far", body: "y".repeat(400) }],
    });
    expect(context.sizes.dropped).toBe(0);
    expect(context.sizes.sections["The story so far"]).toBeGreaterThanOrEqual(100);
    expect(context.sizes.total).toBeLessThan(1000);
  });

  test("the oldest messages go first to stay under budget", () => {
    const context = buildTurnContext({ persona: "persona", profile, now, recent: thread, budget: 2000 });
    expect(context.sizes.dropped).toBeGreaterThan(0);
    expect(context.sizes.total).toBeLessThanOrEqual(2000);
    expect(context.messages.at(-1)).toEqual({ role: "assistant", content: "x".repeat(400) });
  });

  test("never below the minimum window, even over budget", () => {
    const context = buildTurnContext({ persona: "persona", profile, now, recent: thread, budget: 10 });
    expect(context.sizes.recentMessages).toBe(MIN_RECENT_MESSAGES);
  });
});

describe("pictures in the context", () => {
  const picture = (id: string) => ({ id, name: "tibo-a-red-fox.jpg", mediaType: "image/jpeg", kind: "image" as const, size: 2048 });

  test("a picture Tibo made is an app note after its words, with its ref and prompt", () => {
    const messages = toModelMessages(
      [
        message({ id: "u1", role: "user", body: "draw me a fox" }),
        message({ id: "t1", turnId: "turn", role: "tibo", body: "Fox incoming!" }),
        message({ id: "t2", turnId: "turn", role: "tibo", body: "", attachments: [picture("3f2a9c1b-7d4e-4b1a-9c2d-0e1f2a3b4c5d")] }),
        message({ id: "u2", role: "user", body: "make it blue" }),
      ],
      () => "a red fox in snow",
    );
    expect(messages).toEqual([
      { role: "user", content: "draw me a fox" },
      { role: "assistant", content: "Fox incoming!" },
      {
        role: "user",
        content:
          '[App event, not written by the user] You sent a picture you made (ref 3f2a9c1b), from the prompt: "a red fox in snow".\n\nmake it blue',
      },
    ]);
  });

  test("a photo the user sent is named with its ref", () => {
    const [sent] = toModelMessages([
      message({ id: "u1", role: "user", body: "make this a painting", attachments: [{ ...picture("ab12cd34-0000-4000-8000-000000000000"), name: "me.jpg" }] }),
    ]);
    expect(sent).toEqual({ role: "user", content: 'make this a painting\n[Attached image: "me.jpg", 2 KB, ref ab12cd34]' });
  });
});

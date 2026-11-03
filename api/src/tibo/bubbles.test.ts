import { describe, expect, test } from "bun:test";
import {
  BubbleSplitter,
  TYPING_MAX_MS,
  joinBubbles,
  reactionOf,
  splitBubbles,
  typingDelayMs,
} from "./bubbles.ts";

describe("splitBubbles", () => {
  test("splits on delimiter lines", () => {
    expect(splitBubbles("Hi!\n---\nHow's it going?\n---\nTell me.", 5)).toEqual([
      "Hi!",
      "How's it going?",
      "Tell me.",
    ]);
  });

  test("a reply without delimiters is one bubble", () => {
    expect(splitBubbles("Line one\n\nLine two", 5)).toEqual(["Line one\n\nLine two"]);
  });

  test("ignores empty bubbles and stray delimiters", () => {
    expect(splitBubbles("---\nA\n---\n---\nB\n---", 5)).toEqual(["A", "B"]);
  });

  test("accepts longer dash lines and spaces", () => {
    expect(splitBubbles("A\n  -----  \nB", 5)).toEqual(["A", "B"]);
  });

  test("keeps dashes inside a line", () => {
    expect(splitBubbles("A --- B", 5)).toEqual(["A --- B"]);
  });

  test("past the cap, the rest joins the last bubble", () => {
    expect(splitBubbles("1\n---\n2\n---\n3\n---\n4", 2)).toEqual(["1", "2\n\n3\n\n4"]);
  });
});

describe("BubbleSplitter", () => {
  test("emits a bubble as soon as its delimiter streams in", () => {
    const splitter = new BubbleSplitter(5);
    expect(splitter.push("Hel")).toEqual([]);
    expect(splitter.push("lo\n-")).toEqual([]);
    expect(splitter.push("--\nSec")).toEqual(["Hello"]);
    expect(splitter.push("ond")).toEqual([]);
    expect(splitter.finish()).toEqual(["Second"]);
  });

  test("a trailing delimiter without a newline adds nothing", () => {
    const splitter = new BubbleSplitter(5);
    expect(splitter.push("Only\n---")).toEqual([]);
    expect(splitter.finish()).toEqual(["Only"]);
  });
});

describe("typing", () => {
  test("longer bubbles take longer, up to the cap", () => {
    expect(typingDelayMs("ok")).toBeLessThan(typingDelayMs("a much longer bubble of text"));
    expect(typingDelayMs("x".repeat(5000))).toBe(TYPING_MAX_MS);
  });

  test("joinBubbles round-trips", () => {
    const bubbles = ["One", "Two", "Three"];
    expect(splitBubbles(joinBubbles(bubbles), 5)).toEqual(bubbles);
  });
});

describe("reactions", () => {
  test("a reaction line is taken out and reported once", () => {
    const splitter = new BubbleSplitter(5);
    expect(splitter.push("[react: 😂]\nHa!\n---\n")).toEqual(["Ha!"]);
    expect(splitter.takeReaction()).toBe("😂");
    expect(splitter.takeReaction()).toBeNull();
    expect(splitter.finish()).toEqual([]);
  });

  test("a reply can be only a reaction", () => {
    const splitter = new BubbleSplitter(5);
    expect(splitter.push("[react: 👍🏽]")).toEqual([]);
    expect(splitter.finish()).toEqual([]);
    expect(splitter.takeReaction()).toBe("👍🏽");
  });

  test("only one emoji counts; other text is no reaction", () => {
    expect(reactionOf("[react: 🧑‍💻]")).toBe("🧑‍💻");
    expect(reactionOf("[React:❤️]")).toBe("❤️");
    expect(reactionOf("[react: 😂😂]")).toBeNull();
    expect(reactionOf("[react: lol]")).toBeNull();
    expect(reactionOf("react: 😂")).toBeNull();
  });

  test("a bad reaction line is still hidden", () => {
    expect(splitBubbles("[react: nope]\nHi", 5)).toEqual(["Hi"]);
  });
});

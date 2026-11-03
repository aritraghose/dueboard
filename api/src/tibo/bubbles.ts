// Splitting Tibo's streamed reply into chat bubbles, and how long each one
// "takes to type". Pure, so `bubbles.test.ts` covers it.
//
// The model separates bubbles with a line holding only `---` (the persona
// asks for it). A delimiter was chosen over a `send_message` tool: it works
// with plain text streaming, keeps tool calls for real actions, and a reply
// that ignores it still arrives, as one bubble. The agent also breaks a
// bubble at the end of each tool step. Bubbles are emitted as soon as their delimiter
// streams in, so the first can be "typed" while the model writes the rest.

export const BUBBLE_DELIMITER = "---";

/** A line that is only the delimiter (dashes, maybe with spaces). */
const DELIMITER_LINE = /^\s*-{3,}\s*$/;

/**
 * Tibo reacting to the user's latest message: a line of its own,
 * `[react: 😂]` (the persona says when). Never shown as text; the first one
 * in a reply counts.
 */
const REACT_LINE = /^\s*\[\s*react\s*:\s*(.+?)\s*\]\s*$/i;
/** One emoji, maybe with modifiers or joined (👍🏽, 🧑‍💻), nothing else. */
const ONE_EMOJI = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:[\u{FE0F}\u{20E3}\p{Emoji_Modifier}]|\u{200D}(?:\p{Extended_Pictographic}|\p{Regional_Indicator})|\p{Regional_Indicator})*$/u;

/** The emoji from a `[react: …]` line, or `null` if the line isn't one (or isn't one emoji). */
export const reactionOf = (line: string): string | null => {
  const emoji = REACT_LINE.exec(line)?.[1];
  return emoji && emoji.length <= 16 && ONE_EMOJI.test(emoji) ? emoji : null;
};

/** The reaction line the model writes, for showing it its own past turns. */
export const reactionLine = (emoji: string) => `[react: ${emoji}]`;

/**
 * Feeds streamed text in and hands complete bubbles out. After `max`
 * bubbles, the rest of the reply joins the last one (on `finish`).
 */
export class BubbleSplitter {
  private pending = "";
  private current: string[] = [];
  private emitted = 0;
  private reaction: string | null = null;
  private reactionTaken = false;

  constructor(private readonly max: number) {}

  /** Adds a text delta; returns the bubbles it completed. */
  push(delta: string): string[] {
    this.pending += delta;
    const out: string[] = [];
    let newline = this.pending.indexOf("\n");
    while (newline !== -1) {
      const line = this.pending.slice(0, newline);
      this.pending = this.pending.slice(newline + 1);
      const bubble = this.line(line);
      if (bubble !== null) out.push(bubble);
      newline = this.pending.indexOf("\n");
    }
    return out;
  }

  /** Whether any bubble came out so far. */
  get emittedAny() {
    return this.emitted > 0;
  }

  /** The reply's reaction, once, as soon as its line has streamed in. */
  takeReaction(): string | null {
    if (this.reactionTaken || this.reaction === null) return null;
    this.reactionTaken = true;
    return this.reaction;
  }

  /** The stream ended: returns the last bubble, if it has text. */
  finish(): string[] {
    if (this.pending) {
      const line = this.pending;
      this.pending = "";
      // A trailing delimiter with no newline after it closes nothing new.
      if (!this.isReaction(line) && !DELIMITER_LINE.test(line)) this.current.push(line);
    }
    const last = this.take();
    return last === null ? [] : [last];
  }

  /** Reaction lines are taken out of the text wherever they are; the first one counts. */
  private isReaction(line: string): boolean {
    if (!REACT_LINE.test(line)) return false;
    this.reaction ??= reactionOf(line);
    return true;
  }

  private line(line: string): string | null {
    if (this.isReaction(line)) return null;
    // The last allowed bubble keeps everything, delimiters included as breaks.
    if (DELIMITER_LINE.test(line) && this.emitted < this.max - 1) return this.take();
    this.current.push(DELIMITER_LINE.test(line) ? "" : line);
    return null;
  }

  private take(): string | null {
    const text = this.current.join("\n").trim();
    this.current = [];
    if (!text) return null;
    this.emitted += 1;
    return text;
  }
}

/** Splits a whole reply at once (history, tests). */
export const splitBubbles = (text: string, max: number): string[] => {
  const splitter = new BubbleSplitter(max);
  return [...splitter.push(text), ...splitter.finish()];
};

/** The slowest a bubble "types", in ms, whatever its length. */
export const TYPING_MAX_MS = 3200;
const TYPING_BASE_MS = 500;
/** About 55 characters a second: quick, but readable as typing. */
const TYPING_MS_PER_CHAR = 18;

/** How long Tibo "types" a bubble before it's shown. */
export const typingDelayMs = (text: string) =>
  Math.min(TYPING_MAX_MS, TYPING_BASE_MS + text.length * TYPING_MS_PER_CHAR);

/**
 * The bubbles joined back the way the model wrote them, so Tibo sees its own
 * past turns in the same format it's asked to write.
 */
export const joinBubbles = (bubbles: readonly string[]) => bubbles.join(`\n${BUBBLE_DELIMITER}\n`);

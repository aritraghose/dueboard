export const BUBBLE_DELIMITER = "---";

const DELIMITER_LINE = /^\s*-{3,}\s*$/;

const REACT_LINE = /^\s*\[\s*react\s*:\s*(.+?)\s*\]\s*$/i;
const ONE_EMOJI = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:[\u{FE0F}\u{20E3}\p{Emoji_Modifier}]|\u{200D}(?:\p{Extended_Pictographic}|\p{Regional_Indicator})|\p{Regional_Indicator})*$/u;

export const reactionOf = (line: string): string | null => {
  const emoji = REACT_LINE.exec(line)?.[1];
  return emoji && emoji.length <= 16 && ONE_EMOJI.test(emoji) ? emoji : null;
};

export const reactionLine = (emoji: string) => `[react: ${emoji}]`;

export class BubbleSplitter {
  private pending = "";
  private current: string[] = [];
  private emitted = 0;
  private reaction: string | null = null;
  private reactionTaken = false;

  constructor(private readonly max: number) {}

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

  get emittedAny() {
    return this.emitted > 0;
  }

  takeReaction(): string | null {
    if (this.reactionTaken || this.reaction === null) return null;
    this.reactionTaken = true;
    return this.reaction;
  }

  finish(): string[] {
    if (this.pending) {
      const line = this.pending;
      this.pending = "";
      if (!this.isReaction(line) && !DELIMITER_LINE.test(line)) this.current.push(line);
    }
    const last = this.take();
    return last === null ? [] : [last];
  }

  private isReaction(line: string): boolean {
    if (!REACT_LINE.test(line)) return false;
    this.reaction ??= reactionOf(line);
    return true;
  }

  private line(line: string): string | null {
    if (this.isReaction(line)) return null;
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

export const splitBubbles = (text: string, max: number): string[] => {
  const splitter = new BubbleSplitter(max);
  return [...splitter.push(text), ...splitter.finish()];
};

export const TYPING_MAX_MS = 3200;
const TYPING_BASE_MS = 500;
const TYPING_MS_PER_CHAR = 18;

export const typingDelayMs = (text: string) =>
  Math.min(TYPING_MAX_MS, TYPING_BASE_MS + text.length * TYPING_MS_PER_CHAR);

export const joinBubbles = (bubbles: readonly string[]) => bubbles.join(`\n${BUBBLE_DELIMITER}\n`);

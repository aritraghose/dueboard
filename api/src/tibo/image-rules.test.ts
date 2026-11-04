import { describe, expect, test } from "bun:test";
import {
  IMAGES_PER_DAY,
  IMAGES_PER_TURN,
  imageFileName,
  imageRef,
  imageRefusal,
  parseImageRef,
} from "./image-rules.ts";

const MiB = 1024 * 1024;
const room = { madeThisTurn: 0, madeToday: 0, storedBytes: 0, storageMaxBytes: 500 * MiB };

describe("image refs", () => {
  test("a ref is the start of the attachment id", () => {
    expect(imageRef("3f2a9c1b-7d4e-4b1a-9c2d-0e1f2a3b4c5d")).toBe("3f2a9c1b");
  });

  test("the model's spellings all read as the ref", () => {
    expect(parseImageRef("3f2a9c1b")).toBe("3f2a9c1b");
    expect(parseImageRef("image 3f2a9c1b")).toBe("3f2a9c1b");
    expect(parseImageRef(" #3F2A9C1B ")).toBe("3f2a9c1b");
    expect(parseImageRef("img:3f2a9c1b")).toBe("3f2a9c1b");
    expect(parseImageRef("3f2a9c1b-7d4e-4b1a-9c2d-0e1f2a3b4c5d")).toBe("3f2a9c1b");
  });

  test("anything else isn't a ref", () => {
    expect(parseImageRef("the cat picture")).toBeNull();
    expect(parseImageRef("")).toBeNull();
    expect(parseImageRef("3f2")).toBeNull();
    expect(parseImageRef("%' OR 1=1")).toBeNull();
  });
});

describe("imageRefusal", () => {
  test("room for one more is fine", () => {
    expect(imageRefusal(room)).toBeNull();
    expect(imageRefusal({ ...room, madeToday: IMAGES_PER_DAY - 1 })).toBeNull();
  });

  test("the turn's limit comes first, then the day's, then storage", () => {
    expect(imageRefusal({ ...room, madeThisTurn: IMAGES_PER_TURN, madeToday: IMAGES_PER_DAY })).toBe("turn_limit");
    expect(imageRefusal({ ...room, madeToday: IMAGES_PER_DAY, storedBytes: 500 * MiB })).toBe("daily_limit");
    expect(imageRefusal({ ...room, storedBytes: 495 * MiB })).toBe("storage_full");
  });
});

describe("imageFileName", () => {
  test("a few words of the prompt", () => {
    expect(imageFileName("A red fox trotting through fresh snow, golden hour!", "image/jpeg")).toBe(
      "tibo-a-red-fox-trotting-through-fresh.jpg",
    );
  });

  test("an empty or symbol-only prompt still gets a name", () => {
    expect(imageFileName("✨✨", "image/png")).toBe("tibo-image.png");
  });

  test("accents and other scripts are kept as letters", () => {
    expect(imageFileName("Café in Kraków", "image/jpeg")).toBe("tibo-cafe-in-krakow.jpg");
  });
});

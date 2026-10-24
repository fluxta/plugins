import { describe, expect, it } from "vitest";

import { truncate } from "./truncate";

const graphemes = (text: string) =>
  Array.from(new Intl.Segmenter().segment(text), ({ segment }) => segment);

describe("truncate", () => {
  it("keeps a text within the limit whole", () => {
    expect(truncate("Hello there", 11)).toBe("Hello there");
    expect(truncate("Hello there", 200)).toBe("Hello there");
  });

  it("cuts at the last word boundary within the limit", () => {
    const text = "Hello there, chat";

    expect(truncate(text, 11)).toBe("Hello there");
    expect(truncate(text, 12)).toBe("Hello there,");
    // Never a word heard half-said, nor a trailing space.
    expect(truncate(text, 13)).toBe("Hello there,");
    expect(truncate(text, 15)).toBe("Hello there,");
  });

  it("cuts a 500-character chat message within 200 graphemes, at a word", () => {
    const words = ["streaming", "is", "fun", "today,", "friends!"];
    const message = Array.from(
      { length: 120 },
      (_, i) => words[i % words.length],
    )
      .join(" ")
      .slice(0, 500);

    const cut = truncate(message, 200);

    expect(graphemes(cut).length).toBeLessThanOrEqual(200);
    expect(message.startsWith(cut)).toBe(true);
    expect(message[cut.length]).toBe(" ");
  });

  it("counts graphemes, so an emoji or an accented letter is one and never split", () => {
    expect(truncate("ok 👍🏽👍🏽", 4)).toBe("ok 👍🏽");
    expect(truncate("hi 👨‍👩‍👧 there", 4)).toBe("hi 👨‍👩‍👧");
    // `é` as `e` and a combining accent: two code points, one grapheme.
    expect(truncate("café au lait", 7)).toBe("café au");
  });

  it("cuts a single word longer than the limit between graphemes", () => {
    expect(truncate("a".repeat(300), 200)).toBe("a".repeat(200));
    expect(truncate("👍🏽".repeat(300), 200)).toBe("👍🏽".repeat(200));
    expect(truncate("Ааааааааа", 3)).toBe("Ааа");
  });

  it("keeps the text whole with no limit", () => {
    const long = "word ".repeat(500);

    expect(truncate(long, null)).toBe(long);
  });
});

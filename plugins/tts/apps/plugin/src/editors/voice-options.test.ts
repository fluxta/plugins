import { describe, expect, it } from "vitest";

import type { Voice } from "../speech/provider";
import { languageName, voiceName, voiceOptions } from "./voice-options";

describe("voiceOptions", () => {
  it("names each Voice with its language and quality, sorted by language, then name", () => {
    const voices: Voice[] = [
      { id: "zoe", name: "Zoe", language: "en-US", quality: "premium" },
      { id: "yuri", name: "Yuri", language: "ru-RU", quality: "enhanced" },
      { id: "daniel", name: "Daniel", language: "en-GB" },
      { id: "milena", name: "Milena", language: "ru-RU" },
      { id: "ava", name: "Ava", language: "en-US" },
    ];

    expect(voiceOptions(voices)).toEqual([
      { id: "daniel", label: "Daniel — English (United Kingdom)" },
      { id: "ava", label: "Ava — English (United States)" },
      { id: "zoe", label: "Zoe (Premium) — English (United States)" },
      { id: "milena", label: "Milena — Russian (Russia)" },
      { id: "yuri", label: "Yuri (Enhanced) — Russian (Russia)" },
    ]);
  });
});

describe("voiceName", () => {
  it("adds the quality where there is one", () => {
    expect(voiceName({ id: "a", name: "Ava", language: "en-US" })).toBe("Ava");
    expect(
      voiceName({
        id: "a",
        name: "Ava",
        language: "en-US",
        quality: "premium",
      }),
    ).toBe("Ava (Premium)");
  });

  it("does not repeat a quality macOS already put in the name", () => {
    expect(
      voiceName({
        id: "com.apple.voice.enhanced.ru-RU.Katya",
        name: "Katya (Enhanced)",
        language: "ru-RU",
        quality: "enhanced",
      }),
    ).toBe("Katya (Enhanced)");
  });
});

describe("languageName", () => {
  it("spells a language out, and gives back a tag it cannot read", () => {
    expect(languageName("ru-RU")).toBe("Russian (Russia)");
    expect(languageName("en-US")).toBe("English (United States)");
    expect(languageName("not a tag!")).toBe("not a tag!");
  });
});

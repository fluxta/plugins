import { describe, expect, it } from "vitest";

import type { Voice } from "../speech/provider";
import { languageName, voiceName, voiceOptions } from "./voice-options";

describe("voiceOptions", () => {
  it("names each Voice with its language and quality, sorted by language, then name — its name alone for a Preset to keep", () => {
    const voices: Voice[] = [
      { id: "zoe", name: "Zoe", language: "en-US", quality: "premium" },
      { id: "yuri", name: "Yuri", language: "ru-RU", quality: "enhanced" },
      { id: "daniel", name: "Daniel", language: "en-GB" },
      { id: "milena", name: "Milena", language: "ru-RU" },
      { id: "ava", name: "Ava", language: "en-US" },
    ];

    expect(voiceOptions(voices)).toEqual([
      {
        id: "daniel",
        name: "Daniel",
        label: "Daniel — English (United Kingdom)",
      },
      { id: "ava", name: "Ava", label: "Ava — English (United States)" },
      {
        id: "zoe",
        name: "Zoe (Premium)",
        label: "Zoe (Premium) — English (United States)",
      },
      { id: "milena", name: "Milena", label: "Milena — Russian (Russia)" },
      {
        id: "yuri",
        name: "Yuri (Enhanced)",
        label: "Yuri (Enhanced) — Russian (Russia)",
      },
    ]);
  });

  it("names a voice without a language of its own by its name alone, sorted by name", () => {
    expect(
      voiceOptions([
        { id: "r", name: "Rachel" },
        { id: "a", name: "Adam" },
      ]),
    ).toEqual([
      { id: "a", name: "Adam", label: "Adam" },
      { id: "r", name: "Rachel", label: "Rachel" },
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

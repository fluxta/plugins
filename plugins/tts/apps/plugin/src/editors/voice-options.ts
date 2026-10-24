import type { VoiceOption } from "tts-protocol";

import type { Voice } from "../speech/provider";

const QUALITY = { enhanced: "Enhanced", premium: "Premium" } as const;

/**
 * `Ava (Premium)`: the name, with the quality where there is one. macOS
 * already names some voices so — `Katya (Enhanced)` — and those keep their
 * name as it is.
 */
export function voiceName({ name, quality }: Voice): string {
  if (!quality) {
    return name;
  }
  const label = QUALITY[quality];
  return name.toLowerCase().includes(label.toLowerCase())
    ? name
    : `${name} (${label})`;
}

const languages = new Intl.DisplayNames(["en"], {
  type: "language",
  // "English (United States)", not "American English": every voice of a
  // language then sorts together.
  languageDisplay: "standard",
});

/** `Russian (Russia)` for `ru-RU`; the tag itself when it means nothing. */
export function languageName(tag: string): string {
  try {
    return languages.of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/**
 * Every Voice as the editors list it — `Milena — Russian (Russia)`, or its
 * name alone when it has no language of its own — sorted by language, then
 * name. Its name alone is what a Preset keeps.
 */
export function voiceOptions(voices: readonly Voice[]): VoiceOption[] {
  const collator = new Intl.Collator("en");
  return voices
    .map((voice) => ({
      id: voice.id,
      name: voiceName(voice),
      language:
        voice.language === undefined ? "" : languageName(voice.language),
    }))
    .sort(
      (a, b) =>
        collator.compare(a.language, b.language) ||
        collator.compare(a.name, b.name),
    )
    .map(({ id, name, language }) => ({
      id,
      name,
      label: language === "" ? name : `${name} — ${language}`,
    }));
}

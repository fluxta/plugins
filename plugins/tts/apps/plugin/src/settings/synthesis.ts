import {
  INITIAL_SETTINGS,
  isSpokenBy,
  presetSpeech,
  SYSTEM_PROVIDER,
  type Preset,
  type PresetSpeech,
  type ProviderName,
  type ProviderSettings,
} from "tts-protocol";

import type { Listing } from "../speech/listing";
import { ProviderError, type Provider, type Voice } from "../speech/provider";
import type { Phrase, Synthesis } from "../speech/speech-queue";
import type { Voices } from "../speech/voices";

/** Every Provider a Preset can speak with, by the name a Voice gives. */
export type Providers = {
  [P in ProviderName]: Provider<ProviderSettings[P]>;
};

/** Each Provider's Voices, looked up once and kept. */
export type ProviderVoices = {
  /** The OS's voice among them speaks while there is no Default Preset. */
  system: Voices;
  elevenlabs: Listing<Voice>;
};

/** What turns a Phrase's Preset into its synthesis. */
export type SynthesisSources = {
  /** The Presets as they stand. */
  presets: () => readonly Preset[];
  providers: Providers;
  voices: ProviderVoices;
};

/** What synthesizes `phrase`: its Voice and settings, bound to its Provider. */
export async function synthesisOf(
  phrase: Pick<Phrase, "preset" | "speech">,
  { providers, ...sources }: SynthesisSources,
): Promise<Synthesis> {
  const speech = await speechOf(phrase, sources);
  const { id } = speech.voice;
  if (isSpokenBy(speech, SYSTEM_PROVIDER)) {
    return (text, signal) =>
      providers.system.synthesize(text, id, speech.settings, signal);
  }
  return (text, signal) =>
    providers.elevenlabs.synthesize(text, id, speech.settings, signal);
}

/**
 * What a Phrase speaks with: a Listen's unsaved form, else its Preset as it
 * stands now — an edit reaches the Phrases already waiting — else, while
 * there is no Default Preset, the OS's voice at 1.0×. A Preset that is not
 * here drops the Phrase, as a Voice that is not here does: nothing is
 * substituted for it.
 */
export async function speechOf(
  { preset, speech }: Pick<Phrase, "preset" | "speech">,
  { presets, voices }: Pick<SynthesisSources, "presets" | "voices">,
): Promise<PresetSpeech> {
  if (speech) {
    return speech;
  }
  if (preset) {
    const found = presets().find(({ id }) => id === preset.id);
    if (!found) {
      throw new ProviderError(
        "voice-missing",
        `No Preset ${preset.name} on this computer`,
      );
    }
    return found;
  }
  const id = await voices.system.osDefault();
  return presetSpeech(
    { provider: SYSTEM_PROVIDER, id, name: id },
    INITIAL_SETTINGS.system,
  );
}

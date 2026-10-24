import {
  LISTEN_TEXT,
  type Defaults,
  type EditorMessage,
  type ProviderName,
} from "tts-protocol";

import { effectiveSettings } from "../settings/defaults";
import { readPresetSpeech } from "../settings/presets";
import { speechOf, type SynthesisSources } from "../settings/synthesis";
import { ProviderError } from "../speech/provider";
import type { Phrase } from "../speech/speech-queue";

/** Why a Listen's Voice cannot be heard: its Provider does not list it. */
const MISSING: Record<ProviderName, string> = {
  system: "This voice is not on this computer",
  elevenlabs: "This voice is not among your ElevenLabs voices",
};

export type ListenRequest = Omit<
  Extract<EditorMessage, { event: "listen" }>,
  "event"
>;

/**
 * A Listen's Phrase: the text typed beside the button — the greeting when
 * the field is blank — spoken as the editor's form stands, unsaved: a Preset
 * dialog's own form, or a Speak's Preset and Overrides. What the form leaves
 * out follows the Defaults, as on Speak; the Length Limit plays no part: the
 * streamer typed the text to hear it whole.
 */
export async function listenPhrase(
  { id, text, settings }: ListenRequest,
  defaults: Defaults,
  sources: Pick<SynthesisSources, "presets" | "voices">,
): Promise<Phrase> {
  const { preset, volume, device } = effectiveSettings(defaults, settings);
  const speech = readPresetSpeech(settings.speech);
  if (settings.speech !== undefined && speech === undefined) {
    throw new ProviderError("voice-missing", "Choose a voice to listen to");
  }
  // Answered before the Listen waits its turn, not once it comes.
  const { voice } = await speechOf({ preset, speech }, sources);
  const found = (await sources.voices[voice.provider].list()).some(
    (candidate) => candidate.id === voice.id,
  );
  if (!found) {
    throw new ProviderError("voice-missing", MISSING[voice.provider]);
  }
  return {
    text: text.trim() || LISTEN_TEXT,
    tags: [],
    ...(speech ? { speech } : preset && { preset }),
    volume: volume / 100,
    device,
    listen: id,
  };
}

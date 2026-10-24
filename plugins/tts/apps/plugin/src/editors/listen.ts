import { LISTEN_TEXT, type Defaults, type EditorMessage } from "tts-protocol";

import { effectiveSettings } from "../settings/defaults";
import { ProviderError } from "../speech/provider";
import type { Phrase } from "../speech/speech-queue";
import type { Voices } from "../speech/voices";

export type ListenRequest = Omit<
  Extract<EditorMessage, { event: "listen" }>,
  "event"
>;

/**
 * A Listen's Phrase: the text typed beside the button — the greeting when
 * the field is blank — spoken as the editor's form stands, unsaved. What the
 * form leaves out follows the Defaults, as on Speak; the Length Limit plays
 * no part: the streamer typed the text to hear it whole.
 */
export async function listenPhrase(
  { id, text, settings }: ListenRequest,
  defaults: Defaults,
  voices: Voices,
): Promise<Phrase> {
  const { voice, rate, volume, device } = effectiveSettings(defaults, settings);
  const voiceId = voice ?? (await voices.osDefault());
  // Answered before the Listen waits its turn, not once it comes.
  const found = (await voices.list()).find(
    (candidate) => candidate.id === voiceId,
  );
  if (!found) {
    throw new ProviderError(
      "voice-missing",
      "This voice is not on this computer",
    );
  }
  return {
    text: text.trim() || LISTEN_TEXT,
    tags: [],
    voice: found.id,
    rate,
    volume: volume / 100,
    device,
    listen: id,
  };
}

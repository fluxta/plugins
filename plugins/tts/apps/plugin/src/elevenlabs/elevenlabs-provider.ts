import type { ElevenLabsSettings } from "tts-protocol";

import {
  ProviderError,
  type Audio,
  type Provider,
  type Voice,
} from "../speech/provider";
import { pcm16Wav } from "../speech/wav";
import {
  PCM_SAMPLE_RATE,
  type ElevenLabsClient,
  type VoiceSettings,
} from "./client";

type Client = Pick<ElevenLabsClient, "voices" | "voiceSettings" | "speech">;

/**
 * The `elevenlabs` Provider: the voices of the account whose API key is
 * stored — its My Voices on the site, which is where the set is managed —
 * each spoken through the Preset's Model.
 *
 * Unlike `system`, it does not escape the text: no ElevenLabs Model has a
 * way to read `[whispers]`, `<break>` or `/IPA/` as words, so the text goes
 * as it is written, and the streamer chooses what it may do by choosing the
 * Model.
 */
export class ElevenLabsProvider implements Provider<ElevenLabsSettings> {
  readonly #client: Client;
  /** Each voice's settings as set up on the site, as last looked up. */
  readonly #stored = new Map<string, VoiceSettings>();

  constructor(client: Client) {
    this.#client = client;
  }

  async voices(): Promise<Voice[]> {
    const voices = await this.#client.voices();
    this.#stored.clear();
    for (const { id, settings } of voices) {
      if (settings) {
        this.#stored.set(id, settings);
      }
    }
    return voices.map(({ id, name }) => ({ id, name }));
  }

  async synthesize(
    text: string,
    voiceId: string,
    settings: ElevenLabsSettings,
    signal: AbortSignal,
  ): Promise<Audio> {
    signal.throwIfAborted();
    // Refused here rather than by ElevenLabs: a request costs.
    if (text.trim() === "") {
      throw new ProviderError(
        "rejected",
        "There is nothing to say: the text is empty",
      );
    }
    const voiceSettings = await this.#voiceSettings(voiceId, settings, signal);
    const pcm = await this.#client.speech(
      voiceId,
      {
        text,
        modelId: settings.model,
        ...(voiceSettings && { voiceSettings }),
      },
      signal,
    );
    if (pcm.byteLength < 2) {
      throw new ProviderError(
        "rejected",
        "ElevenLabs gave no sound for this text",
      );
    }
    return pcm16Wav(pcm, PCM_SAMPLE_RATE);
  }

  /**
   * The `voice_settings` to send: none while every setting is Voice's own,
   * so the voice speaks as set up on the site; else all of them — the
   * Preset's where it has one, the voice's own for the rest. ElevenLabs does
   * not say whether it fills a partial `voice_settings` from the voice or
   * from its defaults, so none is left for it to fill.
   */
  async #voiceSettings(
    voiceId: string,
    { speed, stability, similarity, style, speakerBoost }: ElevenLabsSettings,
    signal: AbortSignal,
  ): Promise<VoiceSettings | undefined> {
    const chosen: VoiceSettings = Object.fromEntries(
      Object.entries({
        speed,
        stability,
        similarity_boost: similarity,
        style,
        use_speaker_boost: speakerBoost,
      }).filter(([, setting]) => setting !== undefined),
    );
    if (Object.keys(chosen).length === 0) {
      return undefined;
    }
    return { ...(await this.#storedOf(voiceId, signal)), ...chosen };
  }

  /**
   * A voice's own settings: as the voice list last told them, else asked
   * for — a Phrase can come before any editor has opened — and kept.
   */
  async #storedOf(
    voiceId: string,
    signal: AbortSignal,
  ): Promise<VoiceSettings> {
    const known = this.#stored.get(voiceId);
    if (known) {
      return known;
    }
    const stored = await this.#client.voiceSettings(voiceId, signal);
    this.#stored.set(voiceId, stored);
    return stored;
  }
}

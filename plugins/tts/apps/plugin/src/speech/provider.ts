/**
 * A Voice: what Speak speaks with. It belongs to exactly one Provider, and
 * its `id` means something only to that Provider.
 */
export type Voice = {
  id: string;
  name: string;
  /**
   * A BCP 47 tag, such as `ru-RU`. Absent for a voice that speaks whatever
   * language its text is in — an ElevenLabs voice.
   */
  language?: string;
  /** Present only above the engine's standard voices. */
  quality?: "enhanced" | "premium";
  /** The voice the OS itself speaks with when none is chosen. */
  isDefault?: boolean;
};

/** A whole Phrase as WAV — 16-bit PCM — in memory. */
export type Audio = Uint8Array;

/**
 * A Provider: a source of Voices that turns text into audio. Every Provider
 * returns audio and none speaks by itself — the Player plays it — so a
 * Provider on this computer and one in the cloud plug in the same way.
 *
 * `Settings` are its own, kept by a Preset: they differ between Providers in
 * kind, not just in range. Volume is not among them: it is the Player's, the
 * same for every Provider.
 */
export interface Provider<Settings = unknown> {
  voices(): Promise<Voice[]>;
  /**
   * Turns plain text — never markup — into a whole Phrase of audio. A
   * Provider whose engine reads markup escapes the text itself, so a viewer
   * cannot steer the engine through chat. Aborting `signal` cancels the
   * synthesis and rejects with `signal.reason`; an abort is not an error.
   */
  synthesize(
    text: string,
    voiceId: string,
    settings: Settings,
    signal: AbortSignal,
  ): Promise<Audio>;
}

/**
 * Why a Provider did not produce audio:
 * - `voice-missing` — this Voice is not here;
 * - `rejected` — this engine will not speak this text;
 * - `unavailable` — the Provider cannot work until something outside changes;
 * - `transient` — trying again later may work.
 */
export type ProviderErrorKind =
  "voice-missing" | "rejected" | "unavailable" | "transient";

const PROVIDER_ERROR_KINDS: readonly string[] = [
  "voice-missing",
  "rejected",
  "unavailable",
  "transient",
] satisfies ProviderErrorKind[];

/** A Provider's failure; `message` is the reason, readable by a person. */
export class ProviderError extends Error {
  /**
   * For a `transient` failure, how long to wait before trying again, in
   * milliseconds — a cloud service's rate limit. Absent: at once.
   */
  readonly retryAfter?: number;

  constructor(
    readonly kind: ProviderErrorKind,
    reason: string,
    { retryAfter }: { retryAfter?: number } = {},
  ) {
    super(reason);
    this.name = "ProviderError";
    if (retryAfter !== undefined) {
      this.retryAfter = retryAfter;
    }
  }
}

export function isProviderErrorKind(kind: string): kind is ProviderErrorKind {
  return PROVIDER_ERROR_KINDS.includes(kind);
}

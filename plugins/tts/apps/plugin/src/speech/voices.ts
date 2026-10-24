import { Listing } from "./listing";
import { ProviderError, type Provider, type Voice } from "./provider";

/**
 * A Provider's Voices, looked up once and kept. Asking the engine takes
 * ~80 ms on macOS, which every Phrase on the OS's voice would otherwise wait
 * for; a voice installed meanwhile is spoken with once an editor has opened.
 */
export class Voices extends Listing<Voice> {
  constructor(provider: Provider) {
    super(() => provider.voices());
  }

  /** The id of the voice the OS speaks with when none is chosen. */
  async osDefault(): Promise<string> {
    const voice = osDefaultOf(await this.list());
    if (!voice) {
      throw new ProviderError("voice-missing", "This computer has no voices");
    }
    return voice.id;
  }
}

/** The voice the Provider marks as the OS's own, else its first. */
export function osDefaultOf(voices: readonly Voice[]): Voice | undefined {
  return voices.find(({ isDefault }) => isDefault) ?? voices[0];
}

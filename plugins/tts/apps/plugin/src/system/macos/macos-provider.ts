import type { SystemSettings } from "tts-protocol";

import {
  isProviderErrorKind,
  ProviderError,
  type Audio,
  type Provider,
  type Voice,
} from "../../speech/provider";
import { encodeWav } from "../../speech/wav";
import type { Engine, EngineFailure } from "../script-process";
import { JxaProcess } from "./jxa-process";
import synthesizer from "./synthesizer.jxa";

/**
 * The `system` Provider on macOS: AVSpeechSynthesizer, through a long-lived
 * JXA script — no binary in the package. Not `say`, which starts afresh for
 * every Phrase (~0.5 s), reads a leading `-` in the text as an option, and
 * silently speaks as Samantha when it does not know a voice.
 */
export class MacosProvider implements Provider<SystemSettings> {
  readonly #engine: Engine;

  constructor(engine: Engine = new JxaProcess("synthesizer", synthesizer)) {
    this.#engine = engine;
  }

  voices(): Promise<Voice[]> {
    return new Promise((resolve, reject) => {
      const id = this.#engine.request({ op: "voices" }, (reply) => {
        this.#engine.release(id);
        if (reply.error) {
          reject(providerError(reply.error));
        } else {
          resolve(reply.voices as Voice[]);
        }
      });
    });
  }

  synthesize(
    text: string,
    voiceId: string,
    { rate }: SystemSettings,
    signal: AbortSignal,
  ): Promise<Audio> {
    if (signal.aborted) {
      return Promise.reject(signal.reason);
    }
    const spoken = plainText(text);
    if (!spoken) {
      return Promise.reject(
        new ProviderError(
          "rejected",
          "There is nothing to say: the text is empty",
        ),
      );
    }
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let sampleRate = 0;
      const settle = () => {
        this.#engine.release(id);
        signal.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        this.#engine.notify({ op: "cancel", id });
        settle();
        reject(signal.reason);
      };
      const id = this.#engine.request(
        {
          op: "synthesize",
          text: spoken,
          voice: voiceId,
          rate: avSpeechRate(rate),
        },
        (reply) => {
          if (reply.error) {
            settle();
            reject(providerError(reply.error));
            return;
          }
          if (typeof reply.pcm === "string") {
            chunks.push(Buffer.from(reply.pcm, "base64"));
            sampleRate = Number(reply.sampleRate);
          }
          if (reply.done) {
            settle();
            if (chunks.length === 0) {
              reject(new ProviderError("rejected", "The voice said nothing"));
            } else {
              resolve(encodeWav(float32(Buffer.concat(chunks)), sampleRate));
            }
          }
        },
      );
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
}

/**
 * The text as AVSpeech should read it, or `""` when nothing is left to say.
 * Legacy MacinTalk voices (Fred, Zarvox…) obey embedded commands such as
 * `[[slnc 60000]]` even in plain text, so a viewer could hold the Speech
 * Queue silent for a minute; a space between the brackets disarms them.
 */
export function plainText(text: string): string {
  return text.trim().replaceAll("[[", "[ [");
}

/**
 * Speak's multiplier on AVSpeech's own 0–1 scale. AVSpeech's 0, 0.5 and 1
 * speak about 0.5×, 1× and 4× the normal pace (measured in fluxta/hub#9), so
 * the multiplier maps on a log scale: 0.5× → 0, 1× → 0.5, 2× → 0.75.
 */
export function avSpeechRate(multiplier: number): number {
  const clamped = Math.min(2, Math.max(0.5, multiplier));
  const octaves = Math.log2(clamped);
  return octaves < 0 ? 0.5 + 0.5 * octaves : 0.5 + 0.25 * octaves;
}

function providerError({ kind, reason }: EngineFailure): ProviderError {
  return new ProviderError(
    isProviderErrorKind(kind) ? kind : "unavailable",
    reason,
  );
}

/** Native-endian Float32 samples, copied so their alignment is right. */
function float32(bytes: Buffer): Float32Array {
  return new Float32Array(new Uint8Array(bytes).buffer);
}

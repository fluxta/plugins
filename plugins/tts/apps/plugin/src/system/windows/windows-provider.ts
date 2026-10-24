import {
  isProviderErrorKind,
  ProviderError,
  type Audio,
  type Provider,
  type SynthesisOptions,
  type Voice,
} from "../../speech/provider";
import { pcm16Wav, wavDuration } from "../../speech/wav";
import type { Engine, EngineFailure, Reply } from "../script-process";
import { PowerShellProcess } from "./powershell-process";
import synthesizer from "./synthesizer.ps1";

/** Windows' two voice stores, as a Voice's id begins: `onecore:…`, `sapi:…`. */
export type VoiceStore = "onecore" | "sapi";

/**
 * The `system` Provider on Windows: both of Windows' voice stores, through a
 * long-lived PowerShell script — no binary in the package. OneCore, through
 * WinRT, has the full Microsoft set; SAPI, through COM, also has third-party
 * voices such as RHVoice. The store is part of the Voice's id, and a voice
 * in both is listed once, as OneCore's.
 */
export class WindowsProvider implements Provider {
  readonly #engine: Engine;

  constructor(
    engine: Engine = new PowerShellProcess("synthesizer", synthesizer),
  ) {
    this.#engine = engine;
  }

  voices(): Promise<Voice[]> {
    return new Promise((resolve, reject) => {
      const id = this.#engine.request({ op: "voices" }, (reply) => {
        this.#engine.release(id);
        if (reply.error) {
          reject(providerError(reply.error));
          return;
        }
        const voices = windowsVoices(reply);
        const problems = textsOf(reply.problems);
        if (voices.length === 0 && problems.length > 0) {
          reject(
            new ProviderError(
              "unavailable",
              `No voice store can be read: ${problems.join("; ")}`,
            ),
          );
        } else {
          resolve(voices);
        }
      });
    });
  }

  synthesize(
    text: string,
    voiceId: string,
    { rate }: SynthesisOptions,
    signal: AbortSignal,
  ): Promise<Audio> {
    if (signal.aborted) {
      return Promise.reject(signal.reason);
    }
    const spoken = text.trim();
    if (!spoken) {
      return Promise.reject(
        new ProviderError(
          "rejected",
          "There is nothing to say: the text is empty",
        ),
      );
    }
    const voice = storeVoice(voiceId);
    if (!voice) {
      return Promise.reject(
        new ProviderError(
          "voice-missing",
          `No voice ${voiceId} on this computer`,
        ),
      );
    }
    return new Promise((resolve, reject) => {
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
          store: voice.store,
          voice: voice.id,
          text: spoken,
          rate: voice.store === "sapi" ? sapiRate(rate) : oneCoreRate(rate),
        },
        (reply) => {
          settle();
          if (reply.error) {
            reject(providerError(reply.error));
            return;
          }
          try {
            resolve(audioOf(reply));
          } catch (error) {
            reject(error);
          }
        },
      );
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
}

/** A voice as the script lists it, from either store. */
type ScriptVoice = { id: string; name: string; language: string };

/**
 * The script's two lists as one: OneCore's first, then SAPI's, without the
 * SAPI voices OneCore has too — "Microsoft Zira Desktop" is OneCore's
 * "Microsoft Zira". The default is OneCore's, chosen in Settings, else
 * SAPI's, chosen in Control Panel.
 */
export function windowsVoices(reply: Record<string, unknown>): Voice[] {
  const oneCore = scriptVoices(reply.oneCore);
  const inOneCore = new Set(oneCore.map(sameVoice));
  const sapi = scriptVoices(reply.sapi).filter(
    (voice) => !inOneCore.has(sameVoice(voice)),
  );
  const listed = [
    ...oneCore.map((voice) => ({ store: "onecore" as const, voice })),
    ...sapi.map((voice) => ({ store: "sapi" as const, voice })),
  ];
  const chosen =
    scriptVoices(reply.oneCore).find(({ id }) => id === reply.oneCoreDefault) ??
    scriptVoices(reply.sapi).find(({ id }) => id === reply.sapiDefault);
  const defaultIndex = chosen
    ? listed.findIndex(({ voice }) => sameVoice(voice) === sameVoice(chosen))
    : -1;
  return listed.map(({ store, voice }, index) => ({
    id: `${store}:${voice.id}`,
    name: voice.name,
    language: voice.language || "und",
    ...(index === defaultIndex && { isDefault: true }),
  }));
}

/**
 * Two stores' entries for one voice share their name, less "Microsoft" and
 * SAPI's "Desktop", and their language.
 */
function sameVoice({ name, language }: ScriptVoice): string {
  const plain = name
    .trim()
    .toLowerCase()
    .replace(/^microsoft\s+/, "")
    .replace(/\s+desktop$/, "");
  return `${plain}|${language.toLowerCase()}`;
}

function scriptVoices(value: unknown): ScriptVoice[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }
    const { id, name, language } = entry as Record<string, unknown>;
    return typeof id === "string" && id && typeof name === "string" && name
      ? [{ id, name, language: typeof language === "string" ? language : "" }]
      : [];
  });
}

function textsOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((text): text is string => typeof text === "string")
    : [];
}

/** A Voice's id as its store and the id the store knows it by. */
export function storeVoice(
  voiceId: string,
): { store: VoiceStore; id: string } | undefined {
  const colon = voiceId.indexOf(":");
  const store = voiceId.slice(0, colon);
  const id = voiceId.slice(colon + 1);
  return colon > 0 && id && (store === "onecore" || store === "sapi")
    ? { store, id }
    : undefined;
}

/**
 * SAPI's rate on its −10–10 scale, where 10 is three times the voice's pace
 * and every step multiplies it by the tenth root of 3: 0.5× → −6, 2× → 6.
 */
export function sapiRate(multiplier: number): number {
  const steps = Math.round((10 * Math.log(multiplier)) / Math.log(3));
  return Math.min(10, Math.max(-10, steps));
}

/** WinRT's `SpeakingRate` is the multiplier itself, from 0.5 to 6. */
export function oneCoreRate(multiplier: number): number {
  return Math.min(6, Math.max(0.5, multiplier));
}

/** The audio a synthesis replied with: OneCore's WAV, or SAPI's raw PCM. */
function audioOf(reply: Reply): Audio {
  let audio: Audio | undefined;
  if (typeof reply.wav === "string") {
    audio = new Uint8Array(Buffer.from(reply.wav, "base64"));
  } else if (typeof reply.pcm === "string") {
    if (reply.bits !== 16) {
      throw new ProviderError(
        "unavailable",
        `SAPI wrote ${String(reply.bits)}-bit audio, not 16-bit`,
      );
    }
    audio = pcm16Wav(
      new Uint8Array(Buffer.from(reply.pcm, "base64")),
      Number(reply.sampleRate),
      Number(reply.channels) || 1,
    );
  }
  if (!audio || wavDuration(audio) === 0) {
    throw new ProviderError("rejected", "The voice said nothing");
  }
  return audio;
}

function providerError({ kind, reason }: EngineFailure): ProviderError {
  return new ProviderError(
    isProviderErrorKind(kind) ? kind : "unavailable",
    reason,
  );
}

import { describe, expect, it } from "vitest";

import { ProviderError } from "../../speech/provider";
import { wavDuration } from "../../speech/wav";
import { FakeEngine } from "../fake-engine";
import { avSpeechRate, MacosProvider, plainText } from "./macos-provider";

/** Float32 samples as the synthesizer sends them: base64 of their bytes. */
function pcm(samples: number[]): string {
  return Buffer.from(new Float32Array(samples).buffer).toString("base64");
}

const voice = "com.apple.voice.compact.ru-RU.Milena";

describe("MacosProvider", () => {
  it("lists the synthesizer's voices", async () => {
    const engine = new FakeEngine();
    const provider = new MacosProvider(engine);
    const voices = [
      { id: voice, name: "Milena", language: "ru-RU" },
      {
        id: "com.apple.voice.compact.en-US.Samantha",
        name: "Samantha",
        language: "en-US",
        isDefault: true,
      },
    ];

    const listed = provider.voices();
    engine.reply(1, { voices });

    await expect(listed).resolves.toEqual(voices);
    expect(engine.requests[0].message).toEqual({ op: "voices" });
    expect(engine.listening).toBe(0);
  });

  it("turns the synthesizer's PCM into one WAV", async () => {
    const engine = new FakeEngine();
    const provider = new MacosProvider(engine);

    const audio = provider.synthesize(
      "Привет, чат!",
      voice,
      { rate: 1 },
      new AbortController().signal,
    );
    engine.reply(1, { sampleRate: 22_050, pcm: pcm(Array(11_025).fill(0.5)) });
    engine.reply(1, { sampleRate: 22_050, pcm: pcm(Array(11_025).fill(-0.5)) });
    engine.reply(1, { done: true });

    const wav = await audio;
    expect(engine.requests[0].message).toEqual({
      op: "synthesize",
      text: "Привет, чат!",
      voice,
      rate: 0.5,
    });
    expect(wavDuration(wav)).toBe(1);
    const view = new DataView(wav.buffer);
    expect(view.getInt16(44, true)).toBe(16_384);
    expect(view.getInt16(44 + 11_025 * 2, true)).toBe(-16_383);
    expect(engine.listening).toBe(0);
  });

  it("rejects an empty text without asking the synthesizer", async () => {
    const engine = new FakeEngine();
    const provider = new MacosProvider(engine);

    const audio = provider.synthesize(
      "  \n ",
      voice,
      { rate: 1 },
      new AbortController().signal,
    );

    await expect(audio).rejects.toEqual(
      new ProviderError(
        "rejected",
        "There is nothing to say: the text is empty",
      ),
    );
    await expect(audio).rejects.toHaveProperty("kind", "rejected");
    expect(engine.requests).toHaveLength(0);
  });

  it("passes on the synthesizer's failures with their kind", async () => {
    const engine = new FakeEngine();
    const provider = new MacosProvider(engine);
    const signal = new AbortController().signal;

    const missing = provider.synthesize("Hi", "gone", { rate: 1 }, signal);
    engine.reply(1, {
      error: { kind: "voice-missing", reason: "No voice gone on this Mac" },
    });
    const strange = provider.synthesize("Hi", voice, { rate: 1 }, signal);
    engine.reply(2, { error: { kind: "weird", reason: "Something else" } });

    await expect(missing).rejects.toMatchObject({
      kind: "voice-missing",
      message: "No voice gone on this Mac",
    });
    await expect(strange).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("rejects audio that holds nothing", async () => {
    const engine = new FakeEngine();
    const provider = new MacosProvider(engine);

    const audio = provider.synthesize(
      "Hi",
      voice,
      { rate: 1 },
      new AbortController().signal,
    );
    engine.reply(1, { done: true });

    await expect(audio).rejects.toMatchObject({ kind: "rejected" });
  });

  it("cancels the synthesis when aborted", async () => {
    const engine = new FakeEngine();
    const provider = new MacosProvider(engine);
    const abort = new AbortController();

    const audio = provider.synthesize("Hi", voice, { rate: 1 }, abort.signal);
    abort.abort(new DOMException("Stopped", "AbortError"));

    await expect(audio).rejects.toMatchObject({ name: "AbortError" });
    expect(engine.notified).toEqual([{ op: "cancel", id: 1 }]);
    expect(engine.listening).toBe(0);
  });

  it("does not start a synthesis that is already aborted", async () => {
    const engine = new FakeEngine();
    const provider = new MacosProvider(engine);
    const abort = new AbortController();
    abort.abort(new DOMException("Stopped", "AbortError"));

    await expect(
      provider.synthesize("Hi", voice, { rate: 1 }, abort.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(engine.requests).toHaveLength(0);
  });
});

describe("plainText", () => {
  it("trims the text and disarms embedded speech commands", () => {
    expect(plainText("  [[slnc 60000]] hello [[rate 400]] ")).toBe(
      "[ [slnc 60000]] hello [ [rate 400]]",
    );
  });
});

describe("avSpeechRate", () => {
  it("maps the multiplier onto AVSpeech's scale", () => {
    expect(avSpeechRate(1)).toBe(0.5);
    expect(avSpeechRate(0.5)).toBe(0);
    expect(avSpeechRate(2)).toBe(0.75);
    expect(avSpeechRate(Math.SQRT2)).toBeCloseTo(0.625);
  });

  it("clamps it to 0.5×–2×", () => {
    expect(avSpeechRate(0.1)).toBe(0);
    expect(avSpeechRate(10)).toBe(0.75);
  });
});

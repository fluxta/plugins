import type { ElevenLabsSettings } from "tts-protocol";
import { describe, expect, it, vi } from "vitest";

import { wavDuration } from "../speech/wav";
import { SpeechQueue } from "../speech/speech-queue";
import { ElevenLabsAccount } from "./account";
import { ElevenLabsClient, type ElevenLabsVoice } from "./client";
import { ElevenLabsProvider } from "./elevenlabs-provider";

const rachel: ElevenLabsVoice = {
  id: "rachel-id",
  name: "Rachel",
  settings: {
    stability: 0.4,
    similarity_boost: 0.9,
    style: 0.1,
    use_speaker_boost: true,
    speed: 1.05,
  },
};

/** A second of silence at 24 kHz. */
const SECOND = new Uint8Array(48_000);

function setup() {
  const client = {
    voices: vi.fn<ElevenLabsClient["voices"]>(async () => [rachel]),
    voiceSettings: vi.fn<ElevenLabsClient["voiceSettings"]>(async () => ({
      stability: 0.6,
    })),
    speech: vi.fn<ElevenLabsClient["speech"]>(async () => SECOND),
  };
  const provider = new ElevenLabsProvider(client);
  const signal = new AbortController().signal;
  const say = (settings: ElevenLabsSettings, voice = "rachel-id") =>
    provider.synthesize("Привет, [whispers] чат!", voice, settings, signal);
  return { client, provider, signal, say };
}

const flash = { model: "eleven_flash_v2_5" };

describe("ElevenLabsProvider", () => {
  it("lists My Voices by name", async () => {
    const { provider } = setup();

    expect(await provider.voices()).toEqual([
      { id: "rachel-id", name: "Rachel" },
    ]);
  });

  it("asks for the text as written, through the Preset's Model, as the voice is set up when every setting is its own", async () => {
    const { client, say, signal } = setup();

    const audio = await say(flash);

    expect(client.speech).toHaveBeenCalledWith(
      "rachel-id",
      { text: "Привет, [whispers] чат!", modelId: "eleven_flash_v2_5" },
      signal,
    );
    expect(client.voiceSettings).not.toHaveBeenCalled();
    // ElevenLabs' PCM, as a WAV the Player plays.
    expect(new TextDecoder().decode(audio.subarray(0, 4))).toBe("RIFF");
    expect(wavDuration(audio)).toBeCloseTo(1);
  });

  it("sends every voice setting, the Preset's over the voice's own as the list told them", async () => {
    const { client, provider, say } = setup();
    await provider.voices();

    await say({ ...flash, speed: 1.2, style: 0 });

    expect(client.speech.mock.calls[0][1].voiceSettings).toEqual({
      stability: 0.4,
      similarity_boost: 0.9,
      style: 0,
      use_speaker_boost: true,
      speed: 1.2,
    });
    expect(client.voiceSettings).not.toHaveBeenCalled();
  });

  it("asks for a voice's own settings once when no list has told them", async () => {
    const { client, say } = setup();

    await say({ ...flash, speakerBoost: false });
    await say({ ...flash, speakerBoost: false });

    expect(client.voiceSettings).toHaveBeenCalledOnce();
    expect(client.speech.mock.calls[1][1].voiceSettings).toEqual({
      stability: 0.6,
      use_speaker_boost: false,
    });
  });

  it("rejects an empty text without asking ElevenLabs: a request costs", async () => {
    const { client, provider, signal } = setup();

    await expect(
      provider.synthesize("  ", "rachel-id", flash, signal),
    ).rejects.toMatchObject({ kind: "rejected" });
    expect(client.speech).not.toHaveBeenCalled();
  });

  it("rejects a text ElevenLabs gives no sound for", async () => {
    const { client, say } = setup();
    client.speech.mockResolvedValueOnce(new Uint8Array());

    await expect(say(flash)).rejects.toMatchObject({
      kind: "rejected",
      message: "ElevenLabs gave no sound for this text",
    });
  });

  it("rejects with the signal's reason when stopped before it asks", async () => {
    const { client, provider } = setup();
    const abort = new AbortController();
    abort.abort(new Error("stopped"));

    await expect(
      provider.synthesize("Hi", "rachel-id", flash, abort.signal),
    ).rejects.toThrow("stopped");
    expect(client.speech).not.toHaveBeenCalled();
  });
});

describe("ElevenLabs through the Speech Queue", () => {
  it.each([
    ["text/html", "<html>Service blocked</html>"],
    ["application/json", '{"detail":{"message":"Service blocked"}}'],
  ])(
    "drops an HTTP 200 %s response silently and speaks again once access returns",
    async (contentType, body) => {
      vi.useFakeTimers();
      try {
        let blocked = true;
        const fetch = vi.fn(async () =>
          blocked
            ? new Response(body, { headers: { "content-type": contentType } })
            : new Response(SECOND, {
                headers: { "content-type": "application/octet-stream" },
              }),
        );
        const report = vi.fn();
        const account = new ElevenLabsAccount({ key: () => "key", report });
        account.keyChanged();
        const client = new ElevenLabsClient({
          key: () => "key",
          fetch,
          onOutcome: (outcome, key) => account.outcome(outcome, key),
        });
        const provider = new ElevenLabsProvider(client);
        const play = vi.fn(async (_audio, { onStarted }) => onStarted?.());
        const onDropped = vi.fn();
        const onStarted = vi.fn();
        const onFinished = vi.fn();
        const queue = new SpeechQueue({
          player: { devices: async () => [], play },
          synthesisFor: async () => (text, signal) =>
            provider.synthesize(text, "rachel-id", flash, signal),
          onDropped,
          onStarted,
          onFinished,
        });
        const phrase = {
          text: "Hello",
          tags: [],
          volume: 0,
          device: "system-default" as const,
        };

        queue.enqueue(phrase);
        await vi.runAllTimersAsync();

        expect(fetch).toHaveBeenCalledTimes(2);
        expect(play).not.toHaveBeenCalled();
        expect(onStarted).not.toHaveBeenCalled();
        expect(onFinished).not.toHaveBeenCalled();
        expect(onDropped).toHaveBeenCalledExactlyOnceWith(
          phrase,
          expect.objectContaining({
            kind: "transient",
            message: "ElevenLabs returned an unexpected response",
          }),
        );
        expect(account.status.state).toBe("not-connected");
        expect(report).toHaveBeenLastCalledWith([
          { id: "elevenlabs", title: "ElevenLabs", connected: false },
        ]);
        expect(queue.speaking).toBe(false);

        blocked = false;
        queue.enqueue(phrase);
        await vi.runAllTimersAsync();

        expect(fetch).toHaveBeenCalledTimes(3);
        expect(play).toHaveBeenCalledOnce();
        expect(wavDuration(play.mock.calls[0][0])).toBeCloseTo(1);
        expect(onStarted).toHaveBeenCalledOnce();
        expect(onFinished).toHaveBeenCalledOnce();
        expect(onDropped).toHaveBeenCalledOnce();
        expect(account.status.state).toBe("connected");
        expect(report).toHaveBeenLastCalledWith([
          { id: "elevenlabs", title: "ElevenLabs", connected: true },
        ]);
      } finally {
        vi.useRealTimers();
      }
    },
  );
});

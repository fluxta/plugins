import { describe, expect, it } from "vitest";

import { wavDuration } from "../speech/wav";
import { ElevenLabsClient } from "./client";
import { ElevenLabsProvider } from "./elevenlabs-provider";

/**
 * ElevenLabs itself, with the key in `ELEVENLABS_API_KEY` — never in CI: it
 * spends a few dozen characters of the account's credit. Nothing is played.
 *
 *     ELEVENLABS_API_KEY=sk_… pnpm --filter tts-plugin exec vitest run elevenlabs.integration
 */
const key = process.env.ELEVENLABS_API_KEY;

describe.runIf(key)("ElevenLabs, with a real key", () => {
  const client = new ElevenLabsClient({ key: () => key });
  const provider = new ElevenLabsProvider(client);

  it("lists My Voices and the Models that speak text, Flash v2.5 among them", async () => {
    const [voices, models] = await Promise.all([
      provider.voices(),
      client.models(),
    ]);
    console.log(
      `${voices.length} voices:`,
      voices.map(({ name }) => name),
    );
    console.log(
      "Models:",
      models.map(({ id }) => id),
    );

    expect(voices.length).toBeGreaterThan(0);
    expect(models.map(({ id }) => id)).toContain("eleven_flash_v2_5");
  });

  it("synthesizes a few words with Flash v2.5 as a WAV, with the voice's own settings and with its own", async () => {
    const [voice] = await provider.voices();
    const signal = new AbortController().signal;

    for (const settings of [
      { model: "eleven_flash_v2_5" },
      { model: "eleven_flash_v2_5", speed: 1.2, stability: 0.3 },
    ]) {
      const started = performance.now();
      const audio = await provider.synthesize(
        "Hello, chat!",
        voice.id,
        settings,
        signal,
      );
      const took = Math.round(performance.now() - started);
      console.log(
        `${voice.name}, ${JSON.stringify(settings)}: ${wavDuration(audio).toFixed(2)} s of sound in ${took} ms`,
      );

      expect(new TextDecoder().decode(audio.subarray(0, 4))).toBe("RIFF");
      expect(wavDuration(audio)).toBeGreaterThan(0.3);
    }
  }, 30_000);
});

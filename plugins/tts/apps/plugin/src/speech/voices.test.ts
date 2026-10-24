import { describe, expect, it, vi } from "vitest";

import { ProviderError, type Provider, type Voice } from "./provider";
import { osDefaultOf, Voices } from "./voices";

const milena: Voice = { id: "milena", name: "Milena", language: "ru-RU" };
const ava: Voice = {
  id: "ava",
  name: "Ava",
  language: "en-US",
  quality: "premium",
  isDefault: true,
};

function provider(voices: Provider["voices"]): Provider {
  return { voices, synthesize: async () => new Uint8Array() };
}

describe("Voices", () => {
  it("looks the voices up once, so a Phrase on the OS's voice does not wait for them", async () => {
    const lookUp = vi.fn(async () => [milena, ava]);
    const voices = new Voices(provider(lookUp));

    expect(await voices.osDefault()).toBe("ava");
    expect(await voices.osDefault()).toBe("ava");
    expect(await voices.list()).toEqual([milena, ava]);

    expect(lookUp).toHaveBeenCalledOnce();
  });

  it("looks them up afresh when asked to, and keeps the new list", async () => {
    const lookUp = vi
      .fn<Provider["voices"]>()
      .mockResolvedValueOnce([milena])
      .mockResolvedValueOnce([milena, ava]);
    const voices = new Voices(provider(lookUp));

    expect(await voices.osDefault()).toBe("milena");
    await voices.refresh();

    expect(await voices.osDefault()).toBe("ava");
    expect(lookUp).toHaveBeenCalledTimes(2);
  });

  it("does not keep a failed look-up", async () => {
    const lookUp = vi
      .fn<Provider["voices"]>()
      .mockRejectedValueOnce(new ProviderError("transient", "It crashed"))
      .mockResolvedValueOnce([milena]);
    const voices = new Voices(provider(lookUp));

    await expect(voices.list()).rejects.toThrow("It crashed");

    expect(await voices.list()).toEqual([milena]);
  });

  it("reports a computer without voices as voice-missing", async () => {
    const voices = new Voices(provider(async () => []));

    await expect(voices.osDefault()).rejects.toMatchObject({
      kind: "voice-missing",
    });
  });
});

describe("osDefaultOf", () => {
  it("takes the voice the Provider marks as the OS's, else the first", () => {
    expect(osDefaultOf([milena, ava])).toBe(ava);
    expect(osDefaultOf([milena])).toBe(milena);
    expect(osDefaultOf([])).toBeUndefined();
  });
});

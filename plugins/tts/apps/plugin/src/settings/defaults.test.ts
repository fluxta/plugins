import { INITIAL_DEFAULTS, RATES, type Defaults } from "tts-protocol";
import { describe, expect, it } from "vitest";

import { effectiveSettings, readDefaults } from "./defaults";

const chat = { id: "preset-chat", name: "Chat" };
const announcer = { id: "preset-announcer", name: "Announcer" };

describe("readDefaults", () => {
  it("starts a fresh install without a Default Preset, at 100 %, System default and 200 graphemes", () => {
    expect(readDefaults(undefined)).toEqual({
      volume: 100,
      device: "system-default",
      lengthLimit: 200,
    });
    expect(readDefaults({})).toEqual(INITIAL_DEFAULTS);
  });

  it("reads what was saved", () => {
    const saved: Defaults = {
      preset: chat,
      volume: 45,
      device: { id: "BlackHole2ch_UID", name: "BlackHole 2ch" },
      lengthLimit: 500,
    };

    expect(readDefaults(saved)).toEqual(saved);
    expect(readDefaults({ ...saved, lengthLimit: null }).lengthLimit).toBe(
      null,
    );
  });

  it("clamps the volume to 0–100 %", () => {
    expect(readDefaults({ volume: -5 }).volume).toBe(0);
    expect(readDefaults({ volume: 250 }).volume).toBe(100);
  });

  it("names a saved Preset or device by its id when its name is lost", () => {
    expect(
      readDefaults({
        preset: { id: "preset-chat" },
        device: { id: "BlackHole2ch_UID", name: " " },
      }),
    ).toMatchObject({
      preset: { id: "preset-chat", name: "preset-chat" },
      device: { id: "BlackHole2ch_UID", name: "BlackHole2ch_UID" },
    });
  });

  it("takes a whole number of graphemes as the limit", () => {
    expect(readDefaults({ lengthLimit: 150.7 }).lengthLimit).toBe(150);
  });

  it("falls back to the initial value for whatever it cannot read", () => {
    expect(
      readDefaults({
        preset: { id: "" },
        volume: Number.NaN,
        device: { id: "" },
        lengthLimit: 0,
      }),
    ).toEqual(INITIAL_DEFAULTS);
    expect(
      readDefaults({
        preset: "preset-chat",
        device: "BlackHole 2ch",
        lengthLimit: "none",
      }),
    ).toEqual(INITIAL_DEFAULTS);
    expect(readDefaults([1, 2])).toEqual(INITIAL_DEFAULTS);
  });

  it("leaves out what an older version saved: a voice and a rate", () => {
    expect(
      readDefaults({
        voice: "com.apple.voice.compact.ru-RU.Milena",
        rate: 1.3,
      }),
    ).toEqual(INITIAL_DEFAULTS);
  });
});

describe("effectiveSettings", () => {
  const headphones = { id: "headphones-uid", name: "AirPods" };
  const defaults: Defaults = {
    preset: chat,
    volume: 80,
    device: headphones,
    lengthLimit: 200,
  };

  it("follows every default when the Speak overrides nothing", () => {
    expect(effectiveSettings(defaults, {})).toEqual(defaults);
    expect(effectiveSettings(defaults, null)).toEqual(defaults);
  });

  it("lays each override over its default", () => {
    expect(
      effectiveSettings(defaults, {
        preset: announcer,
        volume: 0,
        device: "system-default",
        lengthLimit: 500,
      }),
    ).toEqual({
      preset: announcer,
      volume: 0,
      device: "system-default",
      lengthLimit: 500,
    });
    expect(effectiveSettings(defaults, { volume: 100 })).toEqual({
      ...defaults,
      volume: 100,
    });
  });

  it("names no Preset while neither the Speak nor the defaults do: the OS's voice speaks", () => {
    expect(effectiveSettings(INITIAL_DEFAULTS, {})).toEqual({
      volume: 100,
      device: "system-default",
      lengthLimit: 200,
    });
  });

  it("speaks with a Speak's own Preset when there is no Default Preset", () => {
    expect(
      effectiveSettings(INITIAL_DEFAULTS, { preset: announcer }).preset,
    ).toEqual(announcer);
  });

  it("plays on a Speak's own device, System default included", () => {
    const blackHole = { id: "BlackHole2ch_UID", name: "BlackHole 2ch" };

    expect(effectiveSettings(defaults, { device: blackHole }).device).toEqual(
      blackHole,
    );
    expect(
      effectiveSettings(defaults, { device: "system-default" }).device,
    ).toBe("system-default");
    expect(
      effectiveSettings(
        { ...defaults, device: "system-default" },
        { device: headphones },
      ).device,
    ).toEqual(headphones);
  });

  it("gives a Speak's own length limit over a default of no limit", () => {
    expect(
      effectiveSettings({ ...defaults, lengthLimit: null }, { lengthLimit: 50 })
        .lengthLimit,
    ).toBe(50);
    expect(
      effectiveSettings({ ...defaults, lengthLimit: null }, {}).lengthLimit,
    ).toBe(null);
  });

  it("clamps an override, and follows the default for one it cannot read", () => {
    expect(effectiveSettings(defaults, { volume: 150 }).volume).toBe(100);
    expect(
      effectiveSettings(defaults, {
        preset: { name: "Chat" },
        volume: "loud",
        device: { name: "AirPods" },
        lengthLimit: -1,
      } as never),
    ).toEqual(defaults);
    // What an older version saved on a Speak.
    expect(
      effectiveSettings(defaults, { voice: "ava", rate: 1.5 } as never),
    ).toEqual(defaults);
  });
});

describe("RATES", () => {
  it("offers 0.5× to 2.0× in steps of 0.1", () => {
    expect(RATES).toHaveLength(16);
    expect(RATES[0]).toBe(0.5);
    expect(RATES[5]).toBe(1);
    expect(RATES.at(-1)).toBe(2);
    expect(RATES).toContain(0.7);
  });
});

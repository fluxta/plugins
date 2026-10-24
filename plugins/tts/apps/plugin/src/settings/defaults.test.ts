import { INITIAL_DEFAULTS, RATES, type Defaults } from "tts-protocol";
import { describe, expect, it } from "vitest";

import { effectiveSettings, readDefaults } from "./defaults";

describe("readDefaults", () => {
  it("starts a fresh install at the OS's voice, 1.0×, 100 %, System default and 200 graphemes", () => {
    expect(readDefaults(undefined)).toEqual({
      rate: 1,
      volume: 100,
      device: "system-default",
      lengthLimit: 200,
    });
    expect(readDefaults({})).toEqual(INITIAL_DEFAULTS);
  });

  it("reads what was saved", () => {
    const saved: Defaults = {
      voice: "com.apple.voice.compact.ru-RU.Milena",
      rate: 1.3,
      volume: 45,
      device: { id: "BlackHole2ch_UID", name: "BlackHole 2ch" },
      lengthLimit: 500,
    };

    expect(readDefaults(saved)).toEqual(saved);
    expect(readDefaults({ ...saved, lengthLimit: null }).lengthLimit).toBe(
      null,
    );
  });

  it("clamps the rate to 0.5×–2× and the volume to 0–100 %", () => {
    expect(readDefaults({ rate: 0.1, volume: -5 })).toMatchObject({
      rate: 0.5,
      volume: 0,
    });
    expect(readDefaults({ rate: 9, volume: 250 })).toMatchObject({
      rate: 2,
      volume: 100,
    });
  });

  it("names a saved device by its id when its name is lost", () => {
    expect(readDefaults({ device: { id: "BlackHole2ch_UID" } }).device).toEqual(
      { id: "BlackHole2ch_UID", name: "BlackHole2ch_UID" },
    );
  });

  it("takes a whole number of graphemes as the limit", () => {
    expect(readDefaults({ lengthLimit: 150.7 }).lengthLimit).toBe(150);
  });

  it("falls back to the initial value for whatever it cannot read", () => {
    expect(
      readDefaults({
        voice: "",
        rate: "fast",
        volume: Number.NaN,
        device: { id: "" },
        lengthLimit: 0,
      }),
    ).toEqual(INITIAL_DEFAULTS);
    expect(
      readDefaults({ voice: 7, device: "BlackHole 2ch", lengthLimit: "none" }),
    ).toEqual(INITIAL_DEFAULTS);
    expect(readDefaults([1, 2])).toEqual(INITIAL_DEFAULTS);
  });
});

describe("effectiveSettings", () => {
  const headphones = { id: "headphones-uid", name: "AirPods" };
  const defaults: Defaults = {
    voice: "milena",
    rate: 1.2,
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
        voice: "ava",
        rate: 0.7,
        volume: 0,
        device: "system-default",
        lengthLimit: 500,
      }),
    ).toEqual({
      voice: "ava",
      rate: 0.7,
      volume: 0,
      device: "system-default",
      lengthLimit: 500,
    });
    expect(effectiveSettings(defaults, { volume: 100 })).toEqual({
      ...defaults,
      volume: 100,
    });
  });

  it("leaves the voice to the OS while neither the Speak nor the defaults name one", () => {
    expect(effectiveSettings(INITIAL_DEFAULTS, {})).toEqual({
      rate: 1,
      volume: 100,
      device: "system-default",
      lengthLimit: 200,
    });
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
    expect(effectiveSettings(defaults, { rate: 5, volume: 150 })).toMatchObject(
      { rate: 2, volume: 100 },
    );
    expect(
      effectiveSettings(defaults, {
        voice: "",
        rate: "fast",
        device: { name: "AirPods" },
        lengthLimit: -1,
      } as never),
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

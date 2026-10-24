import { INITIAL_DEFAULTS } from "tts-protocol";
import { describe, expect, it, vi } from "vitest";

import { DefaultsStore } from "./defaults-store";

describe("DefaultsStore", () => {
  it("reads the saved defaults once loaded", async () => {
    const store = new DefaultsStore({ setPluginSettings: vi.fn() });
    let loaded = false;
    void store.loaded.then(() => (loaded = true));

    await Promise.resolve();
    expect(loaded).toBe(false);
    expect(store.current).toEqual(INITIAL_DEFAULTS);

    store.load({ defaults: { voice: "milena", rate: 1.5 } });
    await store.loaded;

    expect(store.current).toEqual({
      ...INITIAL_DEFAULTS,
      voice: "milena",
      rate: 1.5,
    });
  });

  it("starts from the initial defaults on a fresh install", () => {
    const store = new DefaultsStore({ setPluginSettings: vi.fn() });

    store.load(null);

    expect(store.current).toEqual(INITIAL_DEFAULTS);
  });

  it("takes a change at once, tells the editors and saves it, read warily", async () => {
    const setPluginSettings = vi.fn(async () => {});
    const onChange = vi.fn();
    const store = new DefaultsStore({ setPluginSettings }, onChange);
    store.load({});

    const saved = store.set({
      voice: "ava",
      rate: 7,
      volume: 30,
      device: { id: "BlackHole2ch_UID", name: "BlackHole 2ch" },
      lengthLimit: null,
    });
    // The next Speak already sees it, before the save has finished.
    expect(store.current).toEqual({
      voice: "ava",
      rate: 2,
      volume: 30,
      device: { id: "BlackHole2ch_UID", name: "BlackHole 2ch" },
      lengthLimit: null,
    });
    expect(onChange).toHaveBeenCalledOnce();
    await saved;

    expect(setPluginSettings).toHaveBeenCalledWith({ defaults: store.current });
  });

  it("keeps a change it could not save, and logs it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = new DefaultsStore({
      setPluginSettings: async () => {
        throw new Error("disk full");
      },
    });
    store.load({});

    await store.set({ ...INITIAL_DEFAULTS, volume: 10 });

    expect(store.current.volume).toBe(10);
    expect(warn).toHaveBeenCalledWith(
      "Could not save the plugin's settings: disk full",
    );
    warn.mockRestore();
  });
});

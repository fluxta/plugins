import { INITIAL_DEFAULTS, type Preset, type PresetDraft } from "tts-protocol";
import { describe, expect, it, vi } from "vitest";

import { SettingsStore } from "./settings-store";

const chat: Preset = {
  id: "preset-chat",
  name: "Chat",
  voice: { provider: "system", id: "milena", name: "Milena" },
  settings: { rate: 1.2 },
};
const announcer: Preset = {
  id: "preset-announcer",
  name: "Announcer",
  voice: { provider: "system", id: "ava", name: "Ava (Premium)" },
  settings: { rate: 0.9 },
};

function setup() {
  const setPluginSettings = vi.fn(async () => {});
  const onChange = vi.fn();
  let ids = 0;
  const store = new SettingsStore(
    { setPluginSettings },
    onChange,
    () => `new-${++ids}`,
  );
  return { store, setPluginSettings, onChange };
}

describe("SettingsStore", () => {
  it("reads the saved defaults and Presets once loaded", async () => {
    const { store } = setup();
    let loaded = false;
    void store.loaded.then(() => (loaded = true));

    await Promise.resolve();
    expect(loaded).toBe(false);
    expect(store.defaults).toEqual(INITIAL_DEFAULTS);

    store.load({
      defaults: { preset: { id: chat.id, name: "Chat" }, volume: 50 },
      presets: [chat],
    });
    await store.loaded;

    expect(store.defaults).toEqual({
      ...INITIAL_DEFAULTS,
      preset: { id: chat.id, name: "Chat" },
      volume: 50,
    });
    expect(store.presets).toEqual([chat]);
  });

  it("starts from the initial defaults and no Presets on a fresh install", () => {
    const { store } = setup();

    store.load(null);

    expect(store.defaults).toEqual(INITIAL_DEFAULTS);
    expect(store.presets).toEqual([]);
  });

  it("keeps a Default Preset that did not load, so its Phrases are dropped rather than spoken otherwise", () => {
    const { store } = setup();

    store.load({ defaults: { preset: { id: "gone", name: "Chat" } } });

    expect(store.defaults.preset).toEqual({ id: "gone", name: "Chat" });
  });

  it("takes a change of the defaults at once, tells the editors and saves it, read warily", async () => {
    const { store, setPluginSettings, onChange } = setup();
    store.load({ presets: [chat] });

    const saved = store.setDefaults({
      preset: { id: chat.id, name: "Chat" },
      volume: 300,
      device: { id: "BlackHole2ch_UID", name: "BlackHole 2ch" },
      lengthLimit: null,
    });
    // The next Speak already sees it, before the save has finished.
    expect(store.defaults).toEqual({
      preset: { id: chat.id, name: "Chat" },
      volume: 100,
      device: { id: "BlackHole2ch_UID", name: "BlackHole 2ch" },
      lengthLimit: null,
    });
    expect(onChange).toHaveBeenCalledOnce();
    await saved;

    expect(setPluginSettings).toHaveBeenCalledWith({
      defaults: store.defaults,
      presets: [chat],
    });
  });

  it("keeps the Default Preset when asked for one that is not among the Presets", async () => {
    const { store } = setup();
    store.load({
      defaults: { preset: { id: chat.id, name: "Chat" } },
      presets: [chat],
    });

    await store.setDefaults({ preset: { id: "deleted", name: "Old" } });
    expect(store.defaults.preset).toEqual({ id: chat.id, name: "Chat" });

    // Nor can an editor take the Default Preset away.
    await store.setDefaults({ volume: 40 });
    expect(store.defaults).toMatchObject({
      preset: { id: chat.id, name: "Chat" },
      volume: 40,
    });
  });

  it("adds a new Preset at the end, under an id of its own", async () => {
    const { store, setPluginSettings } = setup();
    store.load({ presets: [chat] });
    const draft = {
      name: announcer.name,
      voice: announcer.voice,
      settings: announcer.settings,
    };

    await store.savePreset(draft);
    // An id no Preset has any more — deleted while its dialog was open.
    await store.savePreset({ ...draft, id: "deleted", name: "Again" });

    expect(store.presets).toEqual([
      chat,
      { ...announcer, id: "new-1" },
      { ...announcer, id: "new-2", name: "Again" },
    ]);
    expect(setPluginSettings).toHaveBeenLastCalledWith({
      defaults: INITIAL_DEFAULTS,
      presets: store.presets,
    });
  });

  it("replaces an edited Preset in its place, and keeps the Default Preset's name in step", async () => {
    const { store } = setup();
    store.load({
      defaults: { preset: { id: chat.id, name: "Chat" } },
      presets: [chat, announcer],
    });

    const renamed: PresetDraft = {
      ...chat,
      name: "Viewers",
      settings: { rate: 1.5 },
    };
    await store.savePreset(renamed);

    expect(store.presets).toEqual([renamed, announcer]);
    expect(store.defaults.preset).toEqual({ id: chat.id, name: "Viewers" });
  });

  it("ignores a Preset without a name or a Voice, or named as another one", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { store, setPluginSettings } = setup();
    store.load({ presets: [chat, announcer] });

    await store.savePreset({ ...announcer, id: undefined, name: " " });
    await store.savePreset({ ...announcer, voice: undefined });
    await store.savePreset({ ...announcer, name: "Chat" });

    expect(store.presets).toEqual([chat, announcer]);
    expect(setPluginSettings).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("deletes a Preset, but never the Default Preset", async () => {
    const { store, setPluginSettings } = setup();
    store.load({
      defaults: { preset: { id: chat.id, name: "Chat" } },
      presets: [chat, announcer],
    });

    await store.deletePreset(chat.id);
    await store.deletePreset("gone");
    expect(setPluginSettings).not.toHaveBeenCalled();

    await store.deletePreset(announcer.id);
    expect(store.presets).toEqual([chat]);
    expect(setPluginSettings).toHaveBeenCalledOnce();
  });

  it("stores the ElevenLabs API key in Plugin Settings, trimmed, and nowhere else", async () => {
    const { store, setPluginSettings } = setup();
    store.load({ presets: [chat] });

    await store.setElevenLabsKey("  sk_secret  ");

    expect(store.elevenLabsKey).toBe("sk_secret");
    expect(setPluginSettings).toHaveBeenCalledWith({
      defaults: INITIAL_DEFAULTS,
      presets: [chat],
      elevenLabs: { key: "sk_secret" },
    });
  });

  it("reads the stored key back, and keeps it through other changes", async () => {
    const { store, setPluginSettings } = setup();
    store.load({ elevenLabs: { key: "sk_secret" } });

    await store.setDefaults({ volume: 40 });

    expect(store.elevenLabsKey).toBe("sk_secret");
    expect(setPluginSettings).toHaveBeenCalledWith(
      expect.objectContaining({ elevenLabs: { key: "sk_secret" } }),
    );
  });

  it("keeps the stored key for a blank one, and saves nothing for the same one", async () => {
    const { store, setPluginSettings } = setup();
    store.load({ elevenLabs: { key: "sk_secret" } });

    await store.setElevenLabsKey(" ");
    await store.setElevenLabsKey(undefined);
    await store.setElevenLabsKey("sk_secret");

    expect(store.elevenLabsKey).toBe("sk_secret");
    expect(setPluginSettings).not.toHaveBeenCalled();
  });

  it("removes the key", async () => {
    const { store, setPluginSettings } = setup();
    store.load({ elevenLabs: { key: "sk_secret" } });

    await store.removeElevenLabsKey();

    expect(store.elevenLabsKey).toBeUndefined();
    expect(setPluginSettings).toHaveBeenCalledWith({
      defaults: INITIAL_DEFAULTS,
      presets: [],
    });
  });

  it("keeps a change it could not save, and logs it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = new SettingsStore({
      setPluginSettings: async () => {
        throw new Error("disk full");
      },
    });
    store.load({});

    await store.setDefaults({ ...INITIAL_DEFAULTS, volume: 10 });

    expect(store.defaults.volume).toBe(10);
    expect(warn).toHaveBeenCalledWith(
      "Could not save the plugin's settings: disk full",
    );
    warn.mockRestore();
  });
});

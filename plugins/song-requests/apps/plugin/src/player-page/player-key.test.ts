import { describe, expect, it } from "vitest";

import type { PluginSettings } from "../settings";
import { ensurePlayerKey, newPlayerKey } from "./player-key";

function settingsStore() {
  const saved: PluginSettings[] = [];
  return {
    saved,
    save: async (settings: PluginSettings) => {
      saved.push(settings);
    },
  };
}

describe("the Player Key", () => {
  it("is made on first start and saved with the other settings", async () => {
    const store = settingsStore();

    const key = await ensurePlayerKey({ other: 1 }, store.save);

    expect(key).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(store.saved).toEqual([{ other: 1, playerKey: key }]);
  });

  it("stays the one already saved", async () => {
    const store = settingsStore();

    expect(await ensurePlayerKey({ playerKey: "kept" }, store.save)).toBe(
      "kept",
    );
    expect(store.saved).toEqual([]);
  });

  it("is different on every computer", async () => {
    const one = await ensurePlayerKey({}, async () => {});
    const two = await ensurePlayerKey({}, async () => {});

    expect(one).not.toBe(two);
  });

  it("is replaced with a fresh one", () => {
    const key = newPlayerKey();

    expect(key).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(newPlayerKey()).not.toBe(key);
  });
});

import { describe, expect, it, vi } from "vitest";

import { SettingsStore, type StoredSettings } from "./store";

function storeWithWrites() {
  const writes: StoredSettings[] = [];
  const onChange = vi.fn();
  const store = new SettingsStore(
    {
      setPluginSettings: async (settings) => {
        writes.push(structuredClone(settings));
      },
    },
    onChange,
  );
  return { store, writes, onChange };
}

describe("SettingsStore", () => {
  it("loads the persisted Stopwatches", async () => {
    const { store } = storeWithWrites();
    const onAir = {
      id: "s1",
      name: "On air",
      timing: { state: "running", accumulatedMs: 0, runningSince: 1_000 },
    };

    store.load({ stopwatches: [onAir] });

    await expect(store.loaded).resolves.toBeUndefined();
    expect(store.stopwatch("s1")).toEqual(onAir);
  });

  it("starts empty when nothing was ever saved", () => {
    const { store } = storeWithWrites();

    store.load(null);

    expect(store.timers()).toEqual([]);
    expect(store.stopwatches()).toEqual([]);
  });

  it("loads the persisted Timers, dropping one it cannot read", () => {
    const { store } = storeWithWrites();
    const water = {
      id: "t1",
      name: "Water",
      durationMs: 1_800_000,
      repeatedStart: "restart",
      repeat: true,
      maxTimes: 4,
      countdown: {
        state: "running",
        cycle: 2,
        scheduledAt: 3_600_000,
        dueAt: 3_600_000,
        stepDurationMs: null,
      },
    };

    store.load({ timers: [water, { ...water, id: "t2", durationMs: -1 }] });

    expect(store.timers()).toEqual([water]);
  });

  it("keeps a Timer's countdown when the Plugin Editor changes it", async () => {
    const { store, writes } = storeWithWrites();
    const countdown = {
      state: "running",
      cycle: 1,
      scheduledAt: 5_000,
      dueAt: 5_000,
      stepDurationMs: 600_000,
    } as const;
    store.load({});

    await store.addTimer("t1", {
      name: " Grace ",
      durationMs: 900_000,
      repeatedStart: "restart",
      repeat: false,
      maxTimes: null,
    });
    await store.setCountdown("t1", countdown);
    await store.updateTimer("t1", {
      name: "Grace period",
      durationMs: 600_000,
      repeatedStart: "ignore",
      repeat: true,
      maxTimes: 3,
    });

    expect(writes[0]?.timers).toEqual([
      {
        id: "t1",
        name: "Grace",
        durationMs: 900_000,
        repeatedStart: "restart",
        repeat: false,
        maxTimes: null,
        countdown: { state: "idle" },
      },
    ]);
    expect(store.timer("t1")).toEqual({
      id: "t1",
      name: "Grace period",
      durationMs: 600_000,
      repeatedStart: "ignore",
      repeat: true,
      maxTimes: 3,
      countdown,
    });

    await store.removeTimer("t1");
    expect(store.timers()).toEqual([]);
  });

  it("drops what it cannot read instead of failing the load", () => {
    const { store } = storeWithWrites();

    store.load({
      // A key this version does not use.
      language: "ru",
      stopwatches: [
        { id: "s1", name: "On air", timing: { state: "idle" } },
        { id: "s2", name: "Broken", timing: { state: "stopped" } },
        "nonsense",
      ],
    });

    expect(store.stopwatches().map((stopwatch) => stopwatch.id)).toEqual([
      "s1",
    ]);
  });

  it("persists the whole settings on every change and reports it", async () => {
    const { store, writes, onChange } = storeWithWrites();
    store.load({});

    await store.addStopwatch("s1", "  On air ");
    await store.setTiming("s1", { state: "paused", accumulatedMs: 5_000 });
    await store.renameStopwatch("s1", "Live");
    await store.removeStopwatch("s1");

    expect(writes).toEqual([
      {
        timers: [],
        stopwatches: [{ id: "s1", name: "On air", timing: { state: "idle" } }],
      },
      {
        timers: [],
        stopwatches: [
          {
            id: "s1",
            name: "On air",
            timing: { state: "paused", accumulatedMs: 5_000 },
          },
        ],
      },
      {
        timers: [],
        stopwatches: [
          {
            id: "s1",
            name: "Live",
            timing: { state: "paused", accumulatedMs: 5_000 },
          },
        ],
      },
      { timers: [], stopwatches: [] },
    ]);
    expect(onChange).toHaveBeenCalledTimes(4);
  });

  it("holds a change in memory before the save finishes", () => {
    const { store } = storeWithWrites();
    store.load({});

    void store.addStopwatch("s1", "On air");

    expect(store.stopwatch("s1")?.name).toBe("On air");
  });

  it("keeps a change when the save fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = new SettingsStore({
      setPluginSettings: () => Promise.reject(new Error("disk full")),
    });
    store.load({});

    await expect(store.addStopwatch("s1", "On air")).resolves.toBeUndefined();

    expect(store.stopwatch("s1")).toBeDefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("disk full"));
    warn.mockRestore();
  });
});

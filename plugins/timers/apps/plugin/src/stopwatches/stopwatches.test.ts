import type { StopwatchTiming } from "timers-protocol";
import { describe, expect, it } from "vitest";

import { SettingsStore } from "../store";
import { Stopwatches } from "./stopwatches";

const MINUTE = 60_000;

/** A clock the test moves by hand. */
function manualClock(start = 1_700_000_000_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

function setup(timing: StopwatchTiming = { state: "idle" }) {
  const store = new SettingsStore({ setPluginSettings: async () => {} });
  store.load({ stopwatches: [{ id: "s1", name: "On air", timing }] });
  const clock = manualClock();
  return { store, clock, stopwatches: new Stopwatches(store, clock.now) };
}

describe("Stopwatches", () => {
  it("Start → Pause → Start → Reset yields the running intervals only", async () => {
    const { stopwatches, clock } = setup();

    await stopwatches.start("s1");
    clock.advance(40 * MINUTE);
    expect(await stopwatches.pause("s1")).toMatchObject({
      elapsed: "0:40:00",
    });

    // Ten minutes off air: not counted.
    clock.advance(10 * MINUTE);
    await stopwatches.start("s1");
    clock.advance(94 * MINUTE + 5_000);

    expect(await stopwatches.reset("s1")).toEqual({
      elapsed: "2:14:05",
      hours: 2,
      minutes: 14,
      seconds: 5,
      totalSeconds: 8045,
    });
    expect(await stopwatches.state("s1")).toBe("idle");
  });

  it("includes the time Fluxta was closed for a Stopwatch left running", async () => {
    const twoHoursAgo = 1_700_000_000_000 - 2 * 60 * MINUTE;
    const { stopwatches } = setup({
      state: "running",
      accumulatedMs: 15 * MINUTE,
      runningSince: twoHoursAgo,
    });

    expect(await stopwatches.read("s1")).toMatchObject({
      elapsed: "2:15:00",
    });
  });

  it("resumes a paused Stopwatch from where it stopped", async () => {
    const { stopwatches, clock } = setup({
      state: "paused",
      accumulatedMs: 30 * MINUTE,
    });

    await stopwatches.start("s1");
    clock.advance(5 * MINUTE);

    expect(await stopwatches.state("s1")).toBe("running");
    expect(await stopwatches.read("s1")).toMatchObject({
      minutes: 35,
    });
  });

  it("leaves a running Stopwatch's interval alone when started again", async () => {
    const { stopwatches, store, clock } = setup();

    await stopwatches.start("s1");
    const timing = store.stopwatch("s1")?.timing;
    clock.advance(MINUTE);
    await stopwatches.start("s1");

    expect(store.stopwatch("s1")?.timing).toBe(timing);
  });

  it("reads without changing anything", async () => {
    const { stopwatches, store, clock } = setup();
    await stopwatches.start("s1");
    clock.advance(MINUTE);
    const before = store.stopwatch("s1");

    await stopwatches.read("s1");

    expect(store.stopwatch("s1")).toBe(before);
  });

  it("produces zero for an idle Stopwatch paused or reset, and leaves it idle", async () => {
    const { stopwatches } = setup();

    expect(await stopwatches.pause("s1")).toMatchObject({
      elapsed: "0:00:00",
      totalSeconds: 0,
    });
    expect(await stopwatches.reset("s1")).toMatchObject({ totalSeconds: 0 });
    expect(await stopwatches.state("s1")).toBe("idle");
  });

  it("answers nothing for a Stopwatch that is not there", async () => {
    const { stopwatches } = setup();

    expect(await stopwatches.start("gone")).toBeUndefined();
    expect(await stopwatches.pause(undefined)).toBeUndefined();
    expect(await stopwatches.reset("gone")).toBeUndefined();
    expect(await stopwatches.read("gone")).toBeUndefined();
    expect(await stopwatches.state("gone")).toBeUndefined();
  });

  it("waits for the settings before answering", async () => {
    const store = new SettingsStore({ setPluginSettings: async () => {} });
    const stopwatches = new Stopwatches(store, () => 0);

    const state = stopwatches.state("s1");
    store.load({
      stopwatches: [
        {
          id: "s1",
          name: "On air",
          timing: { state: "paused", accumulatedMs: 1 },
        },
      ],
    });

    expect(await state).toBe("paused");
  });
});

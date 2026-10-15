import { StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { StopwatchActionSettings } from "timers-protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStopwatchStatesOptions } from "../options/stopwatch-states";
import { createStopwatchesOptions } from "../options/stopwatches";
import { createStopwatchStateSource } from "../sources/stopwatch-state";
import { Stopwatches } from "../stopwatches/stopwatches";
import { SettingsStore } from "../store";
import { PauseStopwatchAction } from "./pause-stopwatch";
import { ReadStopwatchAction } from "./read-stopwatch";
import { ResetStopwatchAction } from "./reset-stopwatch";
import { StartStopwatchAction } from "./start-stopwatch";

const MINUTE = 60_000;

function setup() {
  const store = new SettingsStore({ setPluginSettings: async () => {} });
  store.load({
    stopwatches: [{ id: "s1", name: "On air", timing: { state: "idle" } }],
  });
  let now = 0;
  const stopwatches = new Stopwatches(store, () => now);
  return {
    store,
    stopwatches,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

function context(settings: StopwatchActionSettings) {
  return new StandaloneTriggerContext<StopwatchActionSettings>(
    "action-1",
    settings,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Stopwatch Actions", () => {
  it("start, pause and read produce the elapsed time; start produces nothing", async () => {
    const { stopwatches, advance } = setup();
    const start = new StartStopwatchAction(stopwatches);
    const pause = new PauseStopwatchAction(stopwatches);
    const read = new ReadStopwatchAction(stopwatches);

    expect(await start.onTrigger(context({ stopwatch: "s1" }))).toBeUndefined();
    advance(45 * MINUTE);

    expect(await read.onTrigger(context({ stopwatch: "s1" }))).toEqual({
      elapsed: "0:45:00",
      hours: 0,
      minutes: 45,
      seconds: 0,
      totalSeconds: 2700,
    });
    expect(await pause.onTrigger(context({ stopwatch: "s1" }))).toMatchObject({
      elapsed: "0:45:00",
    });
  });

  it("reset produces the time before the reset", async () => {
    const { stopwatches, advance } = setup();
    await stopwatches.start("s1");
    advance(90 * MINUTE);

    const produced = await new ResetStopwatchAction(stopwatches).onTrigger(
      context({ stopwatch: "s1" }),
    );

    expect(produced).toMatchObject({ hours: 1, minutes: 30 });
    expect(await stopwatches.state("s1")).toBe("idle");
  });

  it("does nothing and produces nothing for a missing Stopwatch, and says so", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { stopwatches } = setup();

    await new StartStopwatchAction(stopwatches).onTrigger(context({}));
    const produced = await new ResetStopwatchAction(stopwatches).onTrigger(
      context({ stopwatch: "gone" }),
    );

    expect(produced).toEqual({});
    expect(warn).toHaveBeenNthCalledWith(
      1,
      "Start Stopwatch did nothing: no Stopwatch is chosen",
    );
    expect(warn).toHaveBeenNthCalledWith(
      2,
      "Reset Stopwatch did nothing: Stopwatch gone no longer exists",
    );
  });
});

describe("stopwatchState", () => {
  it("answers the state of the Stopwatch its param names", async () => {
    const { stopwatches } = setup();
    const source = createStopwatchStateSource(stopwatches);

    expect(await source.resolve({ itemId: 0, args: { stopwatch: "s1" } })).toBe(
      "idle",
    );
    await stopwatches.start("s1");
    expect(await source.resolve({ itemId: 0, args: { stopwatch: "s1" } })).toBe(
      "running",
    );
  });

  it("is absent for a Stopwatch that is not there", async () => {
    const { stopwatches } = setup();
    const source = createStopwatchStateSource(stopwatches);

    expect(
      await source.resolve({ itemId: 0, args: { stopwatch: "gone" } }),
    ).toBeNull();
    expect(await source.resolve({ itemId: 0, args: null })).toBeNull();
  });
});

describe("Options Sources", () => {
  it("list the Stopwatches by name and the three states", async () => {
    const { store } = setup();

    expect(await createStopwatchesOptions(store).resolve({ args: {} })).toEqual(
      [{ value: "s1", label: "On air" }],
    );
    expect(await createStopwatchStatesOptions().resolve({ args: {} })).toEqual([
      { value: "idle", label: "Idle" },
      { value: "running", label: "Running" },
      { value: "paused", label: "Paused" },
    ]);
  });
});

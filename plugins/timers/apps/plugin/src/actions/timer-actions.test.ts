import { StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { TimerElapsed } from "timers-protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createTimerStatesOptions } from "../options/timer-states";
import { createTimersOptions } from "../options/timers";
import { createRemainingSecondsSource } from "../sources/remaining-seconds";
import { createTimerStateSource } from "../sources/timer-state";
import { SettingsStore } from "../store";
import { Timers } from "../timers/timers";
import { AddTimeAction } from "./add-time";
import { CancelTimerAction } from "./cancel-timer";
import { StartTimerAction } from "./start-timer";

const MINUTE = 60_000;

function setup() {
  const store = new SettingsStore({ setPluginSettings: async () => {} });
  store.load({
    timers: [
      {
        id: "t1",
        name: "Grace",
        durationMs: 15 * MINUTE,
        repeatedStart: "restart",
        repeat: false,
        maxTimes: null,
        countdown: { state: "idle" },
      },
    ],
  });
  let now = 0;
  const fired: TimerElapsed[] = [];
  const timers = new Timers(
    store,
    (elapsed) => fired.push(elapsed),
    () => now,
    () => () => {},
  );
  return {
    store,
    timers,
    fired,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

/**
 * The settings as the Action receives them — after Fluxta has resolved
 * every `{{…}}` in them, so a reference to a number arrives as one.
 */
function context(settings: Record<string, unknown>) {
  return new StandaloneTriggerContext<never>("action-1", settings as never);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Timer Actions", () => {
  it("start for the Timer's own duration, or the one the step gives", async () => {
    const { timers } = setup();
    const start = new StartTimerAction(timers);

    expect(await start.onTrigger(context({ timer: "t1" }))).toBeUndefined();
    expect(await timers.remainingMs("t1")).toBe(15 * MINUTE);

    await start.onTrigger(context({ timer: "t1", duration: "5:00" }));
    expect(await timers.remainingMs("t1")).toBe(5 * MINUTE);

    // `{{variables.grace}}` holding the number 600.
    await start.onTrigger(context({ timer: "t1", duration: 600 }));
    expect(await timers.remainingMs("t1")).toBe(10 * MINUTE);

    // An emptied reference: the Timer's own duration, without a word.
    await start.onTrigger(context({ timer: "t1", duration: "" }));
    expect(await timers.remainingMs("t1")).toBe(15 * MINUTE);
  });

  it("start for the Timer's own duration when the step's is not one, and say so", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { timers } = setup();

    await new StartTimerAction(timers).onTrigger(
      context({ timer: "t1", duration: "soon" }),
    );

    expect(await timers.remainingMs("t1")).toBe(15 * MINUTE);
    expect(warn).toHaveBeenCalledWith(
      `Start Timer counted the Timer's own duration: "soon" is not a duration`,
    );
  });

  it("cancel a running Timer", async () => {
    const { timers } = setup();
    await timers.start("t1");

    await new CancelTimerAction(timers).onTrigger(context({ timer: "t1" }));

    expect(await timers.state("t1")).toBe("idle");
  });

  it("add time given as text or as a number", async () => {
    const { timers } = setup();
    const addTime = new AddTimeAction(timers);
    await timers.start("t1");

    await addTime.onTrigger(context({ timer: "t1", amount: "2:00" }));
    await addTime.onTrigger(context({ timer: "t1", amount: 60 }));

    expect(await timers.remainingMs("t1")).toBe(18 * MINUTE);
  });

  it("add no time when the amount is not one, and say so", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { timers } = setup();
    await timers.start("t1");

    await new AddTimeAction(timers).onTrigger(context({ timer: "t1" }));

    expect(await timers.remainingMs("t1")).toBe(15 * MINUTE);
    expect(warn).toHaveBeenCalledWith(
      `Add Time did nothing: "" is not an amount of time`,
    );
  });

  it("do nothing for a missing Timer, and say so", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { timers } = setup();

    await new StartTimerAction(timers).onTrigger(context({}));
    await new CancelTimerAction(timers).onTrigger(context({ timer: "gone" }));
    await new AddTimeAction(timers).onTrigger(
      context({ timer: "gone", amount: "60" }),
    );

    expect(warn.mock.calls).toEqual([
      ["Start Timer did nothing: no Timer is chosen"],
      ["Cancel Timer did nothing: Timer gone no longer exists"],
      ["Add Time did nothing: Timer gone no longer exists"],
    ]);
  });
});

describe("timerState and remainingSeconds", () => {
  it("answer for the Timer their param names", async () => {
    const { timers, advance } = setup();
    const state = createTimerStateSource(timers);
    const remaining = createRemainingSecondsSource(timers);
    const args = { timer: "t1" };

    expect(await state.resolve({ itemId: 0, args })).toBe("idle");
    expect(await remaining.resolve({ itemId: 0, args })).toBeNull();

    await timers.start("t1");
    advance(MINUTE + 500);

    expect(await state.resolve({ itemId: 0, args })).toBe("running");
    // 13 min 59.5 s left reads as 840, not 839.
    expect(await remaining.resolve({ itemId: 0, args })).toBe(840);
  });

  it("are absent for a Timer that is not there", async () => {
    const { timers } = setup();

    for (const source of [
      createTimerStateSource(timers),
      createRemainingSecondsSource(timers),
    ]) {
      expect(
        await source.resolve({ itemId: 0, args: { timer: "gone" } }),
      ).toBeNull();
      expect(await source.resolve({ itemId: 0, args: null })).toBeNull();
    }
  });
});

describe("Timer Options Sources", () => {
  it("list the Timers by name and the two states", async () => {
    const { store } = setup();

    expect(await createTimersOptions(store).resolve({ args: {} })).toEqual([
      { value: "t1", label: "Grace" },
    ]);
    expect(await createTimerStatesOptions().resolve({ args: {} })).toEqual([
      { value: "idle", label: "Idle" },
      { value: "running", label: "Running" },
    ]);
  });
});

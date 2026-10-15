import type {
  Countdown,
  Timer,
  TimerElapsed,
  TimerFields,
} from "timers-protocol";
import { describe, expect, it } from "vitest";

import { SettingsStore } from "../store";
import type { Scheduler } from "./scheduler";
import { MAX_SLEEP_MS, Timers } from "./timers";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const START = 1_700_000_000_000;

const GRACE: Timer = {
  id: "t1",
  name: "Grace",
  durationMs: 15 * MINUTE,
  repeatedStart: "restart",
  repeat: false,
  maxTimes: null,
  countdown: { state: "idle" },
};

const WATER: Timer = {
  ...GRACE,
  name: "Water",
  durationMs: 30 * MINUTE,
  repeat: true,
};

/**
 * A countdown persisted before the plugin started, `intervalMs` after
 * `startedAt` — the Timer's own duration — and in its first cycle.
 */
function runningSince(startedAt: number, intervalMs: number): Countdown {
  return {
    state: "running",
    cycle: 1,
    scheduledAt: startedAt + intervalMs,
    dueAt: startedAt + intervalMs,
    stepDurationMs: null,
  };
}

/**
 * Timers against a clock and a scheduler the test drives. `advance` moves
 * time on and wakes the sidecar whenever it asked to be woken on the way —
 * `lateMs` after the moment asked for, as a real scheduler may be; `sleep`
 * moves the wall clock while the computer is asleep — the pending wake is
 * postponed by as much, as a `setTimeout` is.
 */
function setup(timers: Timer[] = [GRACE], { lateMs = 0 } = {}) {
  let now = START;
  let pending: { at: number; wake: () => void } | undefined;
  const fired: TimerElapsed[] = [];
  /** When each Event went out. */
  const firedAt: number[] = [];
  /** Each fired Timer's state as its Event went out. */
  const statesWhenFired: (string | undefined)[] = [];

  const scheduler: Scheduler = (delayMs, wake) => {
    const entry = { at: now + delayMs + lateMs, wake };
    pending = entry;
    return () => {
      if (pending === entry) {
        pending = undefined;
      }
    };
  };

  const store = new SettingsStore({ setPluginSettings: async () => {} });
  store.load({ timers });

  return {
    store,
    fired,
    firedAt,
    statesWhenFired,
    timers: new Timers(
      store,
      (elapsed) => {
        fired.push(elapsed);
        firedAt.push(now);
        statesWhenFired.push(store.timer(elapsed.timer)?.countdown.state);
      },
      () => now,
      scheduler,
    ),
    now: () => now,
    pendingDelay: () => (pending ? pending.at - now : undefined),
    advance: (ms: number) => {
      const until = now + ms;

      while (pending && pending.at <= until) {
        const { at, wake } = pending;
        pending = undefined;
        now = at;
        wake();
      }

      now = until;
    },
    sleep: (ms: number) => {
      now += ms;

      if (pending) {
        pending.at += ms;
      }
    },
  };
}

describe("Timers", () => {
  it("fires once, after the duration, and is idle before its Event goes out", async () => {
    const { timers, fired, statesWhenFired, advance } = setup();

    await timers.start("t1");
    advance(15 * MINUTE - 1);
    expect(fired).toEqual([]);

    advance(1);
    expect(fired).toEqual([
      { timer: "t1", count: 1, lateSeconds: 0, missed: 0 },
    ]);
    expect(statesWhenFired).toEqual(["idle"]);

    advance(60 * MINUTE);
    expect(fired).toHaveLength(1);
  });

  it("takes a duration from the step over its own", async () => {
    const { timers, fired, advance } = setup();

    await timers.start("t1", 30 * SECOND);
    advance(30 * SECOND);

    expect(fired).toHaveLength(1);
  });

  it("does not fire once cancelled", async () => {
    const { timers, fired, advance } = setup();

    await timers.start("t1");
    advance(10 * MINUTE);
    expect(await timers.cancel("t1")).toBe(true);
    advance(60 * MINUTE);

    expect(fired).toEqual([]);
    expect(await timers.state("t1")).toBe("idle");
  });

  it("counts down again from the start when started while running", async () => {
    const { timers, fired, advance } = setup();

    await timers.start("t1");
    advance(10 * MINUTE);
    await timers.start("t1");
    advance(10 * MINUTE);
    expect(fired).toEqual([]);

    advance(5 * MINUTE);
    expect(fired).toHaveLength(1);
  });

  it("leaves a running countdown alone when told to ignore a repeated Start", async () => {
    const { timers, fired, advance } = setup([
      { ...GRACE, repeatedStart: "ignore" },
    ]);

    await timers.start("t1");
    advance(10 * MINUTE);
    await timers.start("t1", 60 * MINUTE);
    advance(5 * MINUTE);

    expect(fired).toHaveLength(1);
  });

  it("fires later by the time added, and adds nothing to an idle Timer", async () => {
    const { timers, fired, advance } = setup();

    await timers.addTime("t1", 5 * MINUTE);
    expect(await timers.state("t1")).toBe("idle");

    await timers.start("t1");
    advance(10 * MINUTE);
    await timers.addTime("t1", 5 * MINUTE);
    // Due at 20 minutes now, not 15.
    advance(10 * MINUTE - 1);
    expect(fired).toEqual([]);

    advance(1);
    expect(fired).toHaveLength(1);
  });

  it("knows how long is left while it counts down", async () => {
    const { timers, advance } = setup();

    expect(await timers.remainingMs("t1")).toBeUndefined();
    await timers.start("t1");
    advance(MINUTE + 500);

    expect(await timers.remainingMs("t1")).toBe(14 * MINUTE - 500);
  });

  it("fires, late, a Timer that fell due while Fluxta was closed", () => {
    const { timers, fired } = setup([
      {
        ...GRACE,
        countdown: runningSince(START - 17 * MINUTE - 400, 15 * MINUTE),
      },
    ]);

    timers.fireDue();

    expect(fired).toEqual([
      { timer: "t1", count: 1, lateSeconds: 120, missed: 0 },
    ]);
  });

  it("goes on counting a Timer still due after Fluxta was closed", () => {
    const { timers, fired, advance } = setup([
      {
        ...GRACE,
        countdown: runningSince(START - 14 * MINUTE, 15 * MINUTE),
      },
    ]);

    timers.fireDue();
    expect(fired).toEqual([]);

    advance(MINUTE);
    expect(fired).toEqual([
      { timer: "t1", count: 1, lateSeconds: 0, missed: 0 },
    ]);
  });

  it("fires soon after the computer wakes from sleeping past the Due Time", async () => {
    const { timers, fired, advance, sleep } = setup();

    await timers.start("t1");
    advance(MINUTE);
    sleep(20 * MINUTE);
    advance(MAX_SLEEP_MS);

    expect(fired).toHaveLength(1);
    expect(fired[0]?.lateSeconds).toBeGreaterThan(5 * 60);
    expect(fired[0]?.lateSeconds).toBeLessThanOrEqual(
      6 * 60 + MAX_SLEEP_MS / SECOND,
    );
  });

  it("sleeps until the earliest Due Time, and not at all when nothing runs", async () => {
    const { timers, store, pendingDelay } = setup([
      GRACE,
      { ...GRACE, id: "t2", name: "Short", durationMs: 10 * SECOND },
    ]);

    timers.fireDue();
    expect(pendingDelay()).toBeUndefined();

    await timers.start("t1");
    expect(pendingDelay()).toBe(MAX_SLEEP_MS);

    await timers.start("t2");
    expect(pendingDelay()).toBe(10 * SECOND);

    await store.removeTimer("t2");
    await timers.cancel("t1");
    expect(pendingDelay()).toBeUndefined();
  });

  it("does nothing for a Timer that is not there, and a deleted one never fires", async () => {
    const { timers, store, fired, advance } = setup();

    expect(await timers.start(undefined)).toBeUndefined();
    expect(await timers.cancel("gone")).toBeUndefined();
    expect(await timers.addTime("gone", MINUTE)).toBeUndefined();
    expect(await timers.state("gone")).toBeUndefined();

    await timers.start("t1");
    await store.removeTimer("t1");
    advance(60 * MINUTE);

    expect(fired).toEqual([]);
  });
});

describe("repeating Timers", () => {
  it("fire every interval, counting up, until cancelled", async () => {
    const { timers, fired, advance } = setup([WATER]);

    await timers.start("t1");
    advance(90 * MINUTE);
    expect(fired.map(({ count }) => count)).toEqual([1, 2, 3]);
    expect(await timers.state("t1")).toBe("running");

    await timers.cancel("t1");
    advance(120 * MINUTE);
    expect(fired).toHaveLength(3);
  });

  it("fire at most N times, then are idle", async () => {
    const { timers, fired, statesWhenFired, advance } = setup([
      { ...WATER, maxTimes: 4 },
    ]);

    await timers.start("t1");
    advance(10 * 60 * MINUTE);

    expect(fired.map(({ count }) => count)).toEqual([1, 2, 3, 4]);
    expect(statesWhenFired).toEqual(["running", "running", "running", "idle"]);
  });

  it("do not drift over ten cycles when every wake comes late", async () => {
    const { timers, firedAt, advance } = setup([WATER], { lateMs: 700 });

    await timers.start("t1");
    advance(10 * 30 * MINUTE + SECOND);

    expect(firedAt).toHaveLength(10);
    firedAt.forEach((at, cycle) => {
      expect(at - (START + (cycle + 1) * 30 * MINUTE)).toBe(700);
    });
  });

  it("repeat a step's duration rather than their own", async () => {
    const { timers, firedAt, advance } = setup([WATER]);

    await timers.start("t1", 10 * MINUTE);
    advance(30 * MINUTE);

    expect(firedAt).toEqual([10, 20, 30].map((m) => START + m * MINUTE));
  });

  it("move only the current cycle when time is added", async () => {
    const { timers, firedAt, advance } = setup([WATER]);

    await timers.start("t1");
    advance(20 * MINUTE);
    await timers.addTime("t1", 5 * MINUTE);
    advance(40 * MINUTE);

    expect(firedAt).toEqual([35, 60].map((m) => START + m * MINUTE));
  });

  it("start their schedule over from now on a repeated Start", async () => {
    const { timers, fired, firedAt, advance } = setup([WATER]);

    await timers.start("t1");
    advance(70 * MINUTE);
    await timers.start("t1");
    advance(30 * MINUTE);

    expect(firedAt).toEqual([30, 60, 100].map((m) => START + m * MINUTE));
    expect(fired.map(({ count }) => count)).toEqual([1, 2, 1]);
  });

  it("fire once for the cycles missed while Fluxta was closed, then keep to the schedule", () => {
    // Every 30 minutes since 95 minutes ago: due at -65, -35 and -5.
    const { timers, fired, firedAt, advance } = setup([
      {
        ...WATER,
        countdown: runningSince(START - 95 * MINUTE, 30 * MINUTE),
      },
    ]);

    timers.fireDue();
    expect(fired).toEqual([
      { timer: "t1", count: 3, lateSeconds: 5 * 60, missed: 2 },
    ]);

    advance(30 * MINUTE);
    expect(fired[1]).toEqual({
      timer: "t1",
      count: 4,
      lateSeconds: 0,
      missed: 0,
    });
    expect(firedAt[1]).toBe(START + 25 * MINUTE);
  });

  it("fire once and are idle when their limit ran out while Fluxta was closed", async () => {
    // Twice every 30 minutes since 95 minutes ago: due at -65 and -35.
    const { timers, fired, advance } = setup([
      {
        ...WATER,
        maxTimes: 2,
        countdown: runningSince(START - 95 * MINUTE, 30 * MINUTE),
      },
    ]);

    timers.fireDue();
    advance(120 * MINUTE);

    expect(fired).toEqual([
      { timer: "t1", count: 2, lateSeconds: 35 * 60, missed: 1 },
    ]);
    expect(await timers.state("t1")).toBe("idle");
  });

  it("follow the Timer's settings as edited while it runs, from the next cycle", async () => {
    const { timers, store, fired, firedAt, advance } = setup([WATER]);
    const edit = (changes: Partial<TimerFields>) =>
      store.updateTimer("t1", {
        name: WATER.name,
        durationMs: WATER.durationMs,
        repeatedStart: WATER.repeatedStart,
        repeat: WATER.repeat,
        maxTimes: WATER.maxTimes,
        ...changes,
      });

    await timers.start("t1");
    advance(40 * MINUTE);
    await edit({ durationMs: 10 * MINUTE });
    advance(20 * MINUTE);
    await edit({ durationMs: 10 * MINUTE, repeat: false });
    advance(60 * MINUTE);

    // The second cycle keeps its Due Time at 60; the third comes 10 minutes
    // after it, and is the last once the Timer no longer repeats.
    expect(firedAt).toEqual([30, 60, 70].map((m) => START + m * MINUTE));
    expect(fired.map(({ count }) => count)).toEqual([1, 2, 3]);
    expect(await timers.state("t1")).toBe("idle");
  });
});

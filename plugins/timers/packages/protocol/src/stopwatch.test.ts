import { describe, expect, it } from "vitest";

import {
  elapsedMs,
  IDLE,
  pauseTiming,
  startTiming,
  StopwatchSchema,
  validateStopwatchName,
} from "./stopwatch";

const MINUTE = 60_000;

describe("stopwatch timing", () => {
  it("counts only the running intervals across pauses", () => {
    let timing = startTiming(IDLE, 0);
    timing = pauseTiming(timing, 10 * MINUTE);
    // Five minutes paused — not counted.
    timing = startTiming(timing, 15 * MINUTE);

    expect(elapsedMs(timing, 20 * MINUTE)).toBe(15 * MINUTE);

    timing = pauseTiming(timing, 20 * MINUTE);
    expect(timing).toEqual({ state: "paused", accumulatedMs: 15 * MINUTE });
    expect(elapsedMs(timing, 99 * MINUTE)).toBe(15 * MINUTE);
  });

  it("keeps a running Stopwatch as it is when started again", () => {
    const timing = startTiming(IDLE, 1_000);

    expect(startTiming(timing, 5_000)).toBe(timing);
  });

  it("leaves an idle Stopwatch idle when paused", () => {
    expect(pauseTiming(IDLE, 1_000)).toBe(IDLE);
    expect(elapsedMs(IDLE, 1_000)).toBe(0);
  });

  it("is paused, not idle, when started and paused in the same instant", () => {
    expect(pauseTiming(startTiming(IDLE, 1_000), 1_000)).toEqual({
      state: "paused",
      accumulatedMs: 0,
    });
  });

  it("counts nothing for an interval the wall clock was set back across", () => {
    const timing = startTiming(
      { state: "paused", accumulatedMs: 5 * MINUTE },
      10 * MINUTE,
    );

    expect(elapsedMs(timing, 9 * MINUTE)).toBe(5 * MINUTE);
  });
});

describe("StopwatchSchema", () => {
  it("reads every state back from persisted JSON", () => {
    for (const timing of [
      IDLE,
      { state: "running", accumulatedMs: 0, runningSince: 1_700_000_000_000 },
      { state: "paused", accumulatedMs: 42 },
    ]) {
      expect(
        StopwatchSchema.safeParse({ id: "s1", name: "On air", timing }).success,
      ).toBe(true);
    }
  });

  it("refuses a timing it cannot make sense of", () => {
    expect(
      StopwatchSchema.safeParse({
        id: "s1",
        name: "On air",
        timing: { state: "running", accumulatedMs: -1, runningSince: 0 },
      }).success,
    ).toBe(false);
    expect(
      StopwatchSchema.safeParse({
        id: "s1",
        name: "On air",
        timing: { state: "stopped" },
      }).success,
    ).toBe(false);
  });
});

describe("validateStopwatchName", () => {
  const onAir = { id: "s1", name: "On air" };

  it("accepts a new, unique name", () => {
    expect(validateStopwatchName("Break", [onAir])).toBeUndefined();
  });

  it("asks for a name of reasonable length", () => {
    expect(validateStopwatchName("  ", [])).toMatch(/name/);
    expect(validateStopwatchName("x".repeat(61), [])).toMatch(/at most 60/);
  });

  it("refuses a name another Stopwatch has, but not its own", () => {
    expect(validateStopwatchName(" On air ", [onAir])).toMatch(
      /already named "On air"/,
    );
    expect(validateStopwatchName("On air", [onAir], "s1")).toBeUndefined();
  });
});

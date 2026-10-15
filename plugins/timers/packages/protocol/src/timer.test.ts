import { describe, expect, it } from "vitest";

import {
  elapse,
  IDLE_COUNTDOWN,
  remainingMs,
  startCountdown,
  TimerSchema,
  validateTimerName,
  type RunningCountdown,
} from "./timer";

const MINUTE = 60_000;

const grace = {
  id: "t1",
  name: "Grace",
  durationMs: 15 * MINUTE,
  repeatedStart: "restart",
  repeat: false,
  maxTimes: null,
} as const;

const water = { ...grace, repeat: true, durationMs: 30 * MINUTE };

/** `water`, at most `maxTimes` times. */
function waterAtMost(maxTimes: number | null) {
  return { ...water, maxTimes };
}

/** A countdown of every 30 minutes, started at 0, in its `cycle`th cycle. */
function every30(cycle: number): RunningCountdown {
  const scheduledAt = cycle * 30 * MINUTE;
  return {
    state: "running",
    cycle,
    scheduledAt,
    dueAt: scheduledAt,
    stepDurationMs: null,
  };
}

describe("startCountdown", () => {
  it("counts the Timer's own duration", () => {
    expect(startCountdown(grace, 1_000)).toEqual({
      state: "running",
      cycle: 1,
      scheduledAt: 1_000 + 15 * MINUTE,
      dueAt: 1_000 + 15 * MINUTE,
      stepDurationMs: null,
    });
  });

  it("keeps the duration a step gave, for every cycle", () => {
    const countdown = startCountdown(water, 0, MINUTE);

    expect(countdown).toMatchObject({ dueAt: MINUTE, stepDurationMs: MINUTE });
    expect(elapse(water, countdown, MINUTE).next).toMatchObject({
      dueAt: 2 * MINUTE,
    });
  });
});

describe("elapse", () => {
  it("fires a cycle on time and goes on to the next on the schedule", () => {
    const fired = elapse(water, every30(1), 30 * MINUTE + 250);

    expect(fired).toEqual({
      count: 1,
      missed: 0,
      lateMs: 250,
      next: every30(2),
    });
  });

  it("follows the schedule, not the moment a cycle fired", () => {
    // Fired 20 seconds late: the next cycle is still at 60 minutes.
    expect(elapse(water, every30(1), 30 * MINUTE + 20_000).next).toEqual(
      every30(2),
    );
  });

  it("is idle once the last cycle has fired", () => {
    expect(elapse(waterAtMost(4), every30(4), 120 * MINUTE).next).toBe(
      IDLE_COUNTDOWN,
    );
    expect(elapse(grace, every30(1), 30 * MINUTE).next).toBe(IDLE_COUNTDOWN);
  });

  it("fires once for the cycles it slept through, late from the latest", () => {
    // Due at 30, 60, 90 and 120 minutes; awake again at 125.
    const fired = elapse(water, every30(1), 125 * MINUTE);

    expect(fired).toEqual({
      count: 4,
      missed: 3,
      lateMs: 5 * MINUTE,
      next: every30(5),
    });
  });

  it("does not let cycles past the last one fall due", () => {
    // Four times every 30 minutes — over at 120 minutes, whatever the hour.
    const fired = elapse(waterAtMost(4), every30(1), 300 * MINUTE);

    expect(fired).toEqual({
      count: 4,
      missed: 3,
      lateMs: 180 * MINUTE,
      next: IDLE_COUNTDOWN,
    });
  });

  it("measures a moved cycle from its Due Time, and keeps the next on the schedule", () => {
    const moved = { ...every30(1), dueAt: 35 * MINUTE };

    expect(elapse(water, moved, 35 * MINUTE)).toEqual({
      count: 1,
      missed: 0,
      lateMs: 0,
      next: every30(2),
    });
  });

  it("stops after the cycle under way once the Timer no longer repeats", () => {
    expect(elapse(grace, every30(3), 90 * MINUTE)).toEqual({
      count: 3,
      missed: 0,
      lateMs: 0,
      next: IDLE_COUNTDOWN,
    });
    // At most 2, edited while the third cycle ran.
    expect(elapse(waterAtMost(2), every30(3), 90 * MINUTE).next).toBe(
      IDLE_COUNTDOWN,
    );
  });

  it("counts the next cycle with the Timer's duration as it is now", () => {
    const tenMinutes = { ...water, durationMs: 10 * MINUTE };

    expect(elapse(tenMinutes, every30(1), 30 * MINUTE).next).toEqual({
      ...every30(2),
      scheduledAt: 40 * MINUTE,
      dueAt: 40 * MINUTE,
    });
  });
});

describe("remainingMs", () => {
  it("counts down to the Due Time and stops at zero", () => {
    const countdown = { ...every30(1), dueAt: 10_000 };

    expect(remainingMs(countdown, 4_000)).toBe(6_000);
    expect(remainingMs(countdown, 12_000)).toBe(0);
  });

  it("is undefined for a Timer that is not counting down", () => {
    expect(remainingMs(IDLE_COUNTDOWN, 0)).toBeUndefined();
  });
});

describe("TimerSchema", () => {
  it("reads both states back from persisted JSON", () => {
    for (const countdown of [
      IDLE_COUNTDOWN,
      every30(3),
      { ...every30(1), stepDurationMs: MINUTE },
    ]) {
      expect(TimerSchema.safeParse({ ...water, countdown }).success).toBe(true);
    }
  });

  it("refuses a Timer it cannot make sense of", () => {
    for (const timer of [
      { ...grace, countdown: { state: "running", dueAt: 0 } },
      { ...grace, countdown: { ...every30(1), dueAt: 0 } },
      { ...grace, countdown: { ...every30(1), state: "paused" } },
      { ...grace, countdown: { ...every30(1), stepDurationMs: 0 } },
      { ...grace, durationMs: 0, countdown: IDLE_COUNTDOWN },
      { ...grace, maxTimes: 0, countdown: IDLE_COUNTDOWN },
      { ...grace, repeatedStart: "queue", countdown: IDLE_COUNTDOWN },
    ]) {
      expect(TimerSchema.safeParse(timer).success).toBe(false);
    }
  });
});

describe("validateTimerName", () => {
  it("names the Timer in what it refuses", () => {
    expect(validateTimerName("Break", [grace])).toBeUndefined();
    expect(validateTimerName("", [])).toBe("Give this Timer a name.");
    expect(validateTimerName("Grace", [grace])).toBe(
      'Another Timer is already named "Grace".',
    );
    expect(validateTimerName("Grace", [grace], "t1")).toBeUndefined();
  });
});

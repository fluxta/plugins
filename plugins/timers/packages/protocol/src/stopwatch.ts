import { z } from "zod";

import { validateName } from "./names";

/**
 * Where a Stopwatch stands. Times are wall-clock epoch milliseconds, so a
 * running Stopwatch keeps counting while Fluxta is closed: its elapsed time
 * is worked out from `runningSince` whenever it is asked for, never ticked.
 *
 * `idle` is its own state rather than "paused at zero": a Stopwatch started
 * and paused within the same millisecond has still been started, and a
 * scenario that asks "has this session begun?" must not be told no.
 */
export type StopwatchTiming =
  | { state: "idle" }
  | { state: "running"; accumulatedMs: number; runningSince: number }
  | { state: "paused"; accumulatedMs: number };

export type StopwatchState = StopwatchTiming["state"];

export const STOPWATCH_STATES = [
  "idle",
  "running",
  "paused",
] as const satisfies readonly StopwatchState[];

export const IDLE: StopwatchTiming = { state: "idle" };

const Milliseconds = z.number().finite().nonnegative();

export const StopwatchTimingSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("idle") }),
  z.object({
    state: z.literal("running"),
    accumulatedMs: Milliseconds,
    runningSince: z.number().finite(),
  }),
  z.object({ state: z.literal("paused"), accumulatedMs: Milliseconds }),
]);

/** One named Stopwatch, as persisted and as every editor sees it. */
export type Stopwatch = {
  id: string;
  name: string;
  timing: StopwatchTiming;
};

export const StopwatchSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  timing: StopwatchTimingSchema,
});

/**
 * The time a Stopwatch has counted at `now`: every finished interval, plus
 * the one still running. A wall clock set back while it ran (a time-zone
 * fix, NTP) counts that interval as zero rather than subtracting time.
 */
export function elapsedMs(timing: StopwatchTiming, now: number): number {
  switch (timing.state) {
    case "idle":
      return 0;
    case "paused":
      return timing.accumulatedMs;
    case "running":
      return timing.accumulatedMs + Math.max(0, now - timing.runningSince);
  }
}

/** Starts an idle Stopwatch or resumes a paused one; a running one is left as it is. */
export function startTiming(
  timing: StopwatchTiming,
  now: number,
): StopwatchTiming {
  switch (timing.state) {
    case "idle":
      return { state: "running", accumulatedMs: 0, runningSince: now };
    case "paused":
      return {
        state: "running",
        accumulatedMs: timing.accumulatedMs,
        runningSince: now,
      };
    case "running":
      return timing;
  }
}

/** Stops a running Stopwatch counting; an idle or paused one is left as it is. */
export function pauseTiming(
  timing: StopwatchTiming,
  now: number,
): StopwatchTiming {
  return timing.state === "running"
    ? { state: "paused", accumulatedMs: elapsedMs(timing, now) }
    : timing;
}

/** Refuses a name the plugin would refuse — see {@link validateName}. */
export function validateStopwatchName(
  name: string,
  others: readonly Pick<Stopwatch, "id" | "name">[],
  editingId?: string,
): string | undefined {
  return validateName("Stopwatch", name, others, editingId);
}

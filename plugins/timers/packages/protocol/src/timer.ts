import { z } from "zod";

import { DURATION_MAX_MS } from "./duration";
import { validateName } from "./names";

/**
 * Whether a Timer is counting down, and where in its schedule.
 *
 * Times are wall-clock epoch milliseconds, persisted as such, so a Timer
 * keeps counting while Fluxta is closed and one that fell due meanwhile
 * fires as soon as the plugin is back.
 *
 * A running countdown is in its `cycle`th cycle (from 1). `scheduledAt` is
 * that cycle's place on the schedule and `dueAt` its Due Time, the same
 * unless Add Time moved it. The next cycle follows `scheduledAt`, never the
 * moment a cycle fired, so a repeating Timer does not drift.
 *
 * Whether there is a next cycle, and how far ahead, is read from the Timer
 * each time a cycle fires — so a Timer edited in the Plugin Editor while it
 * runs keeps the current cycle's Due Time and follows its new settings from
 * the next one. Only a duration a step gave at Start (`stepDurationMs`)
 * belongs to the countdown: the Timer repeats it until the next Start.
 */
export type Countdown =
  | { state: "idle" }
  | {
      state: "running";
      cycle: number;
      scheduledAt: number;
      dueAt: number;
      stepDurationMs: number | null;
    };

export type RunningCountdown = Extract<Countdown, { state: "running" }>;

export type TimerState = Countdown["state"];

export const TIMER_STATES = [
  "idle",
  "running",
] as const satisfies readonly TimerState[];

export const IDLE_COUNTDOWN: Countdown = { state: "idle" };

/**
 * What Start does to a Timer that is already running: count down again from
 * the start, or leave it be.
 */
export type RepeatedStart = "restart" | "ignore";

export const REPEATED_STARTS = [
  "restart",
  "ignore",
] as const satisfies readonly RepeatedStart[];

/**
 * One named Timer, as persisted and as every editor sees it. A repeating
 * Timer fires every `durationMs`, at most `maxTimes` times — `null` until it
 * is cancelled; a Timer that does not repeat ignores `maxTimes`.
 */
export type Timer = {
  id: string;
  name: string;
  durationMs: number;
  repeatedStart: RepeatedStart;
  repeat: boolean;
  maxTimes: number | null;
  countdown: Countdown;
};

export const DurationMsSchema = z
  .number()
  .int()
  .positive()
  .max(DURATION_MAX_MS);

export const RepeatedStartSchema = z.enum(REPEATED_STARTS);

const CycleSchema = z.number().int().positive();

export const MaxTimesSchema = CycleSchema.nullable();

export const CountdownSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("idle") }),
  z
    .object({
      state: z.literal("running"),
      cycle: CycleSchema,
      scheduledAt: z.number().finite(),
      dueAt: z.number().finite(),
      stepDurationMs: DurationMsSchema.nullable(),
    })
    .refine(({ scheduledAt, dueAt }) => dueAt >= scheduledAt),
]);

export const TimerSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  durationMs: DurationMsSchema,
  repeatedStart: RepeatedStartSchema,
  repeat: z.boolean(),
  maxTimes: MaxTimesSchema,
  countdown: CountdownSchema,
});

/** What a running countdown reads from its Timer each time a cycle fires. */
export type TimerSchedule = Pick<Timer, "durationMs" | "repeat" | "maxTimes">;

/** How long each cycle of `countdown` lasts: a step's duration, or the Timer's. */
export function intervalOf(
  timer: TimerSchedule,
  countdown: RunningCountdown,
): number {
  return countdown.stepDurationMs ?? timer.durationMs;
}

/**
 * The cycle after which a Timer stops: 1 unless it repeats, `null` while it
 * repeats until cancelled.
 */
export function lastCycleOf(timer: TimerSchedule): number | null {
  return timer.repeat ? timer.maxTimes : 1;
}

/**
 * The first cycle of a countdown started at `now`, counting
 * `stepDurationMs` when a step gave one, or else the Timer's own duration.
 */
export function startCountdown(
  timer: TimerSchedule,
  now: number,
  stepDurationMs?: number,
): RunningCountdown {
  const dueAt = now + (stepDurationMs ?? timer.durationMs);

  return {
    state: "running",
    cycle: 1,
    scheduledAt: dueAt,
    dueAt,
    stepDurationMs: stepDurationMs ?? null,
  };
}

/**
 * What a countdown that fell due by `now` fires, and what it goes on to.
 *
 * Every cycle whose place on the schedule passed by `now` is due — more
 * than the current one only when the plugin was not running, or Add Time
 * pushed the current one past the next. They fire once, for the latest of
 * them: `count` is that cycle, `missed` the cycles before it that never
 * fired, and `lateMs` how long after its Due Time it fires. Cycles beyond
 * the Timer's last never fall due — and when the Timer was edited to stop
 * sooner than the cycle under way, that cycle is its last.
 *
 * Then the countdown goes on to the first cycle still ahead on the schedule,
 * as the Timer now says, or is idle once its last cycle has fired.
 */
export function elapse(
  timer: TimerSchedule,
  countdown: RunningCountdown,
  now: number,
): {
  count: number;
  missed: number;
  lateMs: number;
  next: Countdown;
} {
  const { cycle, scheduledAt } = countdown;
  const intervalMs = intervalOf(timer, countdown);
  const lastCycle = lastCycleOf(timer);
  const passed = Math.max(0, Math.floor((now - scheduledAt) / intervalMs));
  const count =
    lastCycle === null
      ? cycle + passed
      : Math.max(cycle, Math.min(cycle + passed, lastCycle));
  const missed = count - cycle;
  const firedFor =
    missed === 0 ? countdown.dueAt : scheduledAt + missed * intervalMs;
  const nextAt = scheduledAt + (missed + 1) * intervalMs;

  return {
    count,
    missed,
    lateMs: Math.max(0, now - firedFor),
    next:
      lastCycle !== null && count >= lastCycle
        ? IDLE_COUNTDOWN
        : {
            ...countdown,
            cycle: count + 1,
            scheduledAt: nextAt,
            dueAt: nextAt,
          },
  };
}

/**
 * How long a Timer has left at `now` — `undefined` when it is not counting
 * down. A Due Time already passed reads as zero: the Timer fires on the
 * sidecar's next wake.
 */
export function remainingMs(
  countdown: Countdown,
  now: number,
): number | undefined {
  return countdown.state === "running"
    ? Math.max(0, countdown.dueAt - now)
    : undefined;
}

/** Refuses a name the plugin would refuse — see {@link validateName}. */
export function validateTimerName(
  name: string,
  others: readonly Pick<Timer, "id" | "name">[],
  editingId?: string,
): string | undefined {
  return validateName("Timer", name, others, editingId);
}

export const TIMER_ELAPSED_EVENT = "timer-elapsed";

/**
 * The fields of a `timer-elapsed` Event, as `manifest.json` declares them —
 * see {@link elapse}. A one-shot Timer fires with `count` 1 and `missed` 0;
 * `lateSeconds` is more than a moment only when the plugin was not running
 * at the Due Time.
 */
export type TimerElapsed = {
  timer: string;
  count: number;
  lateSeconds: number;
  missed: number;
};

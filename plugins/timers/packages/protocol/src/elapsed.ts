/**
 * What Pause, Reset and Read hand to later steps: the clock as text, and the
 * numbers a scenario needs to write the time its own way — "2 h 14 min",
 * "2 ч 14 мин" or "134 minutes" — in a template such as
 * `{{timers.reset-stopwatch.hours}} h {{timers.reset-stopwatch.minutes}} min`.
 * Every part is rounded down to the second, so the parts and the clock never
 * disagree.
 */
export type ElapsedSnapshot = {
  /** `2:14:05` — hours are not capped at 24. */
  elapsed: string;
  /** Whole hours: `2`, or `26` after a day and two hours. */
  hours: number;
  /** Minutes past the hour, 0–59. */
  minutes: number;
  /** Seconds past the minute, 0–59. */
  seconds: number;
  /** The whole time in seconds: `8045`. */
  totalSeconds: number;
};

function split(ms: number) {
  const total = Math.floor(Math.max(0, ms) / 1000);
  return {
    total,
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/** `H:MM:SS`: `0:45:00`, `2:14:05`, `26:00:00`. */
export function formatClock(ms: number): string {
  const { hours, minutes, seconds } = split(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${hours}:${pad(minutes)}:${pad(seconds)}`;
}

export function snapshotOf(ms: number): ElapsedSnapshot {
  const { total, hours, minutes, seconds } = split(ms);

  return {
    elapsed: formatClock(ms),
    hours,
    minutes,
    seconds,
    totalSeconds: total,
  };
}

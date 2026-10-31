/**
 * When YouTube resets its daily quotas: midnight in California (YouTube's
 * quota page, October 2026).
 */
const PACIFIC = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

/** The Pacific wall clock at `time`, written as if it were UTC. */
function pacificWallClock(time: number): number {
  const part = Object.fromEntries(
    PACIFIC.formatToParts(time).map(({ type, value }) => [type, Number(value)]),
  );
  return Date.UTC(
    part.year,
    part.month - 1,
    part.day,
    part.hour,
    part.minute,
    part.second,
  );
}

/** How far Pacific time is behind UTC at `time`: 7 or 8 hours. */
function pacificOffset(time: number): number {
  const whole = Math.floor(time / 1000) * 1000;
  return whole - pacificWallClock(whole);
}

/**
 * The next midnight in California after `now`. Daylight saving changes at
 * 2 a.m. there, so a midnight is never skipped or repeated; the offset is
 * read twice in case it changes in between.
 */
export function nextQuotaReset(now: number): number {
  const today = new Date(pacificWallClock(now));
  const midnight = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate() + 1,
  );
  const guess = midnight + pacificOffset(midnight);
  return midnight + pacificOffset(guess);
}

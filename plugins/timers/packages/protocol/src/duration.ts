/**
 * The longest duration a Timer counts, or one Add Time adds. Long enough for
 * anything a scenario waits on; the bound keeps a mistyped or runaway
 * `{{…}}` value from producing a Due Time no clock can represent.
 */
export const DURATION_MAX_MS = 7 * 24 * 60 * 60 * 1000;

const SECONDS = /^\d+(?:\.\d+)?$/;
const MINUTES_SECONDS = /^(\d+):([0-5]\d)$/;
const HOURS_MINUTES_SECONDS = /^(\d+):([0-5]\d):([0-5]\d)$/;

/**
 * Reads a duration as a Timer's settings or an Action hold it, in
 * milliseconds: a number of seconds (`900`, or `90.5`), or a clock time —
 * `15:00` for minutes and seconds, `1:30:00` for hours as well, the same
 * shape a Stopwatch's Elapsed has.
 *
 * Takes `unknown` because an Action's field may hold a `{{…}}` reference,
 * and Fluxta hands over a reference to a number as a JSON number. Anything
 * else — empty, zero, negative, over {@link DURATION_MAX_MS} — is not a
 * duration, and gives `undefined`.
 */
export function parseDuration(value: unknown): number | undefined {
  const ms = toMilliseconds(value);
  return ms !== undefined && ms > 0 && ms <= DURATION_MAX_MS ? ms : undefined;
}

function toMilliseconds(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value * 1000) : undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const text = value.trim();

  if (SECONDS.test(text)) {
    return Math.round(Number(text) * 1000);
  }

  const long = HOURS_MINUTES_SECONDS.exec(text);

  if (long) {
    return clockMs(long[1], long[2], long[3]);
  }

  const short = MINUTES_SECONDS.exec(text);
  return short ? clockMs("0", short[1], short[2]) : undefined;
}

function clockMs(
  hours: string | undefined,
  minutes: string | undefined,
  seconds: string | undefined,
): number {
  return ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000;
}

/**
 * Why `text` is not a duration, in the words an editor shows under the
 * field — or `undefined` when it is one.
 */
export function validateDuration(text: string): string | undefined {
  if (!text.trim()) {
    return "Enter a duration.";
  }

  if (parseDuration(text) !== undefined) {
    return undefined;
  }

  return toMilliseconds(text) === undefined
    ? "Enter seconds (900) or a clock time (15:00, 1:30:00)."
    : "A duration is more than zero and at most 7 days.";
}

/**
 * Writes a duration the way {@link parseDuration} reads it back: `15:00`,
 * `1:30:00`, or plain seconds (`90.5`) when it is not a whole number of
 * them — so a Timer edited and saved unchanged keeps its duration.
 */
export function formatDuration(ms: number): string {
  if (ms % 1000 !== 0) {
    return String(ms / 1000);
  }

  const total = ms / 1000;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}

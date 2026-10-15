import { describe, expect, it } from "vitest";

import {
  DURATION_MAX_MS,
  formatDuration,
  parseDuration,
  validateDuration,
} from "./duration";

describe("parseDuration", () => {
  it("reads seconds, as a number or as text", () => {
    expect(parseDuration(900)).toBe(900_000);
    expect(parseDuration("900")).toBe(900_000);
    expect(parseDuration(" 90.5 ")).toBe(90_500);
  });

  it("reads a clock time, with or without hours", () => {
    expect(parseDuration("15:00")).toBe(900_000);
    expect(parseDuration("90:30")).toBe(5_430_000);
    expect(parseDuration("1:30:00")).toBe(5_400_000);
    // The shape of a Stopwatch's Elapsed, so it can be handed on as is.
    expect(parseDuration("0:45:07")).toBe(2_707_000);
  });

  it("is not a duration when empty, zero, too long or malformed", () => {
    for (const value of [
      undefined,
      null,
      "",
      "  ",
      0,
      "0:00",
      -5,
      "-5",
      Number.NaN,
      Infinity,
      "15m",
      "1:5",
      "1:60",
      "1:00:60",
      "1::00",
      true,
      { seconds: 5 },
    ]) {
      expect(parseDuration(value)).toBeUndefined();
    }

    expect(parseDuration(DURATION_MAX_MS / 1000)).toBe(DURATION_MAX_MS);
    expect(parseDuration(DURATION_MAX_MS / 1000 + 1)).toBeUndefined();
  });
});

describe("validateDuration", () => {
  it("says what is wrong, or nothing", () => {
    expect(validateDuration("15:00")).toBeUndefined();
    expect(validateDuration("")).toMatch(/Enter a duration/);
    expect(validateDuration("soon")).toMatch(/seconds \(900\)/);
    expect(validateDuration("0")).toMatch(/more than zero/);
    expect(validateDuration("200:00:00")).toMatch(/at most 7 days/);
  });
});

describe("formatDuration", () => {
  it("writes what parseDuration reads back", () => {
    for (const [ms, text] of [
      [900_000, "15:00"],
      [30_000, "0:30"],
      [5_400_000, "1:30:00"],
      [90_500, "90.5"],
    ] as const) {
      expect(formatDuration(ms)).toBe(text);
      expect(parseDuration(text)).toBe(ms);
    }
  });
});

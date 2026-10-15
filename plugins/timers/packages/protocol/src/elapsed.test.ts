import { describe, expect, it } from "vitest";

import { formatClock, snapshotOf } from "./elapsed";

const at = (hours: number, minutes: number, seconds: number) =>
  ((hours * 60 + minutes) * 60 + seconds) * 1000;

describe("formatClock", () => {
  it("writes H:MM:SS, hours uncapped", () => {
    expect(formatClock(at(2, 14, 5))).toBe("2:14:05");
    expect(formatClock(at(0, 45, 0))).toBe("0:45:00");
    expect(formatClock(at(26, 0, 0))).toBe("26:00:00");
    expect(formatClock(0)).toBe("0:00:00");
  });

  it("rounds down to the second", () => {
    expect(formatClock(at(0, 0, 59) + 999)).toBe("0:00:59");
  });
});

describe("snapshotOf", () => {
  it("gives the clock and its parts, rounded down to the second", () => {
    expect(snapshotOf(at(2, 14, 5) + 999)).toEqual({
      elapsed: "2:14:05",
      hours: 2,
      minutes: 14,
      seconds: 5,
      totalSeconds: 8045,
    });
  });

  it("leaves hours uncapped and zero parts as zero", () => {
    expect(snapshotOf(at(26, 0, 30))).toMatchObject({ hours: 26, minutes: 0 });
    expect(snapshotOf(0)).toEqual({
      elapsed: "0:00:00",
      hours: 0,
      minutes: 0,
      seconds: 0,
      totalSeconds: 0,
    });
  });
});

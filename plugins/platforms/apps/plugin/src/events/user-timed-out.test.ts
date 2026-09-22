import { describe, expect, it } from "vitest";

import { toUserTimedOutPayload, type UserTimedOutSource } from "./user-timed-out";

function timedOut(overrides: Partial<UserTimedOutSource> = {}): UserTimedOutSource {
  return {
    userId: "42",
    userName: "troll",
    userDisplayName: "Troll",
    moderatorId: "7",
    moderatorName: "mod",
    moderatorDisplayName: "Mod",
    reason: "cooling off",
    startDate: new Date("2026-01-01T00:00:00Z"),
    endDate: new Date("2026-01-01T00:10:00Z"),
    ...overrides,
  };
}

describe("toUserTimedOutPayload", () => {
  it("carries the timed-out viewer's identity, the moderator and the reason", () => {
    expect(toUserTimedOutPayload(timedOut())).toEqual({
      userId: "42",
      userLogin: "troll",
      userName: "Troll",
      moderatorId: "7",
      moderatorLogin: "mod",
      moderatorName: "Mod",
      reason: "cooling off",
      durationSeconds: 600,
    });
  });

  it("computes the duration from the start and end dates", () => {
    const payload = toUserTimedOutPayload(
      timedOut({
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-01-01T00:05:00Z"),
      }),
    );

    expect(payload.durationSeconds).toBe(300);
  });

  it("reports 0 rather than a negative or missing duration with no end date", () => {
    expect(toUserTimedOutPayload(timedOut({ endDate: null })).durationSeconds).toBe(0);
  });
});

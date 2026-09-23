import { describe, expect, it } from "vitest";

import { toResubscriptionPayload, type ResubscriptionSource } from "./resubscription";

function resubscription(overrides: Partial<ResubscriptionSource> = {}): ResubscriptionSource {
  return {
    userId: "42",
    userName: "viewer",
    userDisplayName: "Viewer",
    tier: "1000",
    cumulativeMonths: 6,
    streakMonths: 3,
    durationMonths: 1,
    messageText: "love the stream!",
    ...overrides,
  };
}

describe("toResubscriptionPayload", () => {
  it("carries the subscriber's identity, tier and message", () => {
    expect(toResubscriptionPayload(resubscription())).toEqual({
      userId: "42",
      userLogin: "viewer",
      userName: "Viewer",
      tier: "1000",
      cumulativeMonths: 6,
      streakMonths: 3,
      durationMonths: 1,
      message: "love the stream!",
    });
  });

  it("reports no streak as 0 rather than a missing value", () => {
    expect(toResubscriptionPayload(resubscription({ streakMonths: null })).streakMonths).toBe(0);
  });
});

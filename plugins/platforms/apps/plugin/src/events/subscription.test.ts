import { describe, expect, it } from "vitest";

import { toSubscriptionPayload, type SubscriptionSource } from "./subscription";

function subscription(overrides: Partial<SubscriptionSource> = {}): SubscriptionSource {
  return {
    userId: "42",
    userName: "viewer",
    userDisplayName: "Viewer",
    tier: "1000",
    isGift: false,
    ...overrides,
  };
}

describe("toSubscriptionPayload", () => {
  it("carries the subscriber's identity and tier", () => {
    expect(toSubscriptionPayload(subscription())).toEqual({
      userId: "42",
      userLogin: "viewer",
      userName: "Viewer",
      tier: "1000",
      isGift: false,
    });
  });

  it("flags a subscription that started from a gift", () => {
    expect(toSubscriptionPayload(subscription({ isGift: true })).isGift).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import { toGiftSubscriptionPayload, type GiftSubscriptionSource } from "./gift-subscription";

function giftSubscription(
  overrides: Partial<GiftSubscriptionSource> = {},
): GiftSubscriptionSource {
  return {
    gifterId: "42",
    gifterName: "generous_viewer",
    gifterDisplayName: "Generous Viewer",
    tier: "1000",
    amount: 5,
    cumulativeAmount: 20,
    isAnonymous: false,
    ...overrides,
  };
}

describe("toGiftSubscriptionPayload", () => {
  it("carries the gifter's identity and the batch size", () => {
    expect(toGiftSubscriptionPayload(giftSubscription())).toEqual({
      gifterId: "42",
      gifterLogin: "generous_viewer",
      gifterName: "Generous Viewer",
      tier: "1000",
      total: 5,
      cumulativeTotal: 20,
      isAnonymous: false,
    });
  });

  it("reports an anonymous gifter as empty identity fields, not null", () => {
    expect(
      toGiftSubscriptionPayload(
        giftSubscription({
          gifterId: null,
          gifterName: null,
          gifterDisplayName: null,
          cumulativeAmount: null,
          isAnonymous: true,
        }),
      ),
    ).toEqual({
      gifterId: "",
      gifterLogin: "",
      gifterName: "",
      tier: "1000",
      total: 5,
      cumulativeTotal: 0,
      isAnonymous: true,
    });
  });
});

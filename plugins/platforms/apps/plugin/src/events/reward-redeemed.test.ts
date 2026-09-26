import { describe, expect, it } from "vitest";

import { toRewardRedeemedPayload, type RewardRedemptionSource } from "./reward-redeemed";

function redemption(overrides: Partial<RewardRedemptionSource> = {}): RewardRedemptionSource {
  return {
    id: "redemption-1",
    rewardId: "reward-1",
    rewardTitle: "Hydrate",
    rewardCost: 500,
    input: "",
    status: "unfulfilled",
    userId: "42",
    userName: "viewer",
    userDisplayName: "Viewer",
    ...overrides,
  };
}

describe("toRewardRedeemedPayload", () => {
  it("carries the reward, the viewer and the channel", () => {
    expect(toRewardRedeemedPayload(redemption())).toEqual({
      redemptionId: "redemption-1",
      rewardId: "reward-1",
      rewardTitle: "Hydrate",
      rewardCost: 500,
      userInput: "",
      status: "unfulfilled",
      userId: "42",
      userLogin: "viewer",
      userName: "Viewer",
    });
  });

  it("keeps the redemption id apart from the reward id", () => {
    // They are easy to confuse and only one of them can fulfil a redemption.
    const payload = toRewardRedeemedPayload(redemption());

    expect(payload.redemptionId).not.toBe(payload.rewardId);
  });

  it("carries what the viewer typed into a reward that asks for input", () => {
    expect(toRewardRedeemedPayload(redemption({ input: "play Doom" })).userInput).toBe(
      "play Doom",
    );
  });

  it("keeps the cost a number, so a condition can compare it", () => {
    expect(toRewardRedeemedPayload(redemption({ rewardCost: 1000 })).rewardCost).toBe(1000);
  });
});

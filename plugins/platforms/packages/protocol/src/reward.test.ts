import { describe, expect, it } from "vitest";

import {
  blankRewardDraft,
  validateRewardDraft,
  type Reward,
  type RewardDraft,
} from "./reward";

function draft(overrides: Partial<RewardDraft> = {}): RewardDraft {
  return { ...blankRewardDraft(), title: "Hydrate", cost: 500, ...overrides };
}

function reward(overrides: Partial<Reward> = {}): Reward {
  return {
    ...draft(),
    id: "reward-1",
    managed: true,
    backgroundColor: "#9147ff",
    paused: false,
    ...overrides,
  };
}

describe("validateRewardDraft", () => {
  it("accepts a filled-in reward", () => {
    expect(validateRewardDraft(draft(), [])).toBeUndefined();
  });

  it("refuses a reward with no title", () => {
    expect(validateRewardDraft(draft({ title: "   " }), [])).toMatch(/title/i);
  });

  it("refuses a title longer than Twitch allows", () => {
    expect(validateRewardDraft(draft({ title: "x".repeat(46) }), [])).toMatch(/45/);
  });

  it("refuses a free reward, which Twitch has no concept of", () => {
    expect(validateRewardDraft(draft({ cost: 0 }), [])).toMatch(/at least 1/i);
  });

  it("refuses a fractional cost", () => {
    expect(validateRewardDraft(draft({ cost: 1.5 }), [])).toMatch(/at least 1/i);
  });

  it("refuses a cooldown longer than a week", () => {
    expect(validateRewardDraft(draft({ cooldown: 604801 }), [])).toMatch(/week/i);
  });

  it("takes zero as no limit rather than as a limit of none", () => {
    expect(
      validateRewardDraft(draft({ maxPerStream: 0, maxPerUserPerStream: 0, cooldown: 0 }), []),
    ).toBeUndefined();
  });

  it("refuses a title the channel already uses, whatever its case", () => {
    // Twitch answers a duplicate with CREATE_CUSTOM_REWARD_DUPLICATE_REWARD,
    // which says nothing to the streamer who typed it.
    expect(validateRewardDraft(draft({ title: "hydrate" }), [reward()])).toMatch(/already/i);
  });

  it("counts an unmanaged reward's title as taken too", () => {
    // The channel is one namespace: Twitch refuses the duplicate regardless of
    // which app created the reward already holding the title.
    expect(validateRewardDraft(draft(), [reward({ managed: false })])).toMatch(/already/i);
  });
});

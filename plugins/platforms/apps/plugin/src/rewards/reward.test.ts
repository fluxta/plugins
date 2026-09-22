import { describe, expect, it } from "vitest";

import { toReward, toRewardData, type CustomRewardSource } from "./reward";

function source(overrides: Partial<CustomRewardSource> = {}): CustomRewardSource {
  return {
    id: "reward-1",
    title: "Hydrate",
    cost: 500,
    prompt: "Make them drink water",
    userInputRequired: false,
    isEnabled: true,
    isPaused: false,
    backgroundColor: "#9147ff",
    maxRedemptionsPerStream: null,
    maxRedemptionsPerUserPerStream: null,
    globalCooldown: null,
    ...overrides,
  };
}

describe("toReward", () => {
  it("carries what the editor lists and what an Action needs", () => {
    expect(toReward(source(), true)).toEqual({
      id: "reward-1",
      title: "Hydrate",
      cost: 500,
      prompt: "Make them drink water",
      userInputRequired: false,
      enabled: true,
      maxPerStream: 0,
      maxPerUserPerStream: 0,
      cooldown: 0,
      managed: true,
      backgroundColor: "#9147ff",
      paused: false,
    });
  });

  it("says a limit Twitch reports as absent is no limit", () => {
    // Twitch spells a disabled limit as null; the editor spells it as zero.
    expect(toReward(source({ maxRedemptionsPerStream: null }), true).maxPerStream).toBe(0);
  });

  it("keeps a limit that is set", () => {
    const reward = toReward(
      source({
        maxRedemptionsPerStream: 5,
        maxRedemptionsPerUserPerStream: 1,
        globalCooldown: 60,
      }),
      true,
    );

    expect([reward.maxPerStream, reward.maxPerUserPerStream, reward.cooldown]).toEqual([5, 1, 60]);
  });

  it("takes manageability from the caller, since no Reward carries it", () => {
    expect(toReward(source(), false).managed).toBe(false);
  });
});

describe("toRewardData", () => {
  const draft = {
    title: "  Hydrate  ",
    cost: 500,
    prompt: "  drink  ",
    userInputRequired: true,
    enabled: false,
    maxPerStream: 3,
    maxPerUserPerStream: 1,
    cooldown: 30,
  };

  it("sends what Twitch takes, trimmed", () => {
    expect(toRewardData(draft)).toEqual({
      title: "Hydrate",
      cost: 500,
      prompt: "drink",
      isEnabled: false,
      userInputRequired: true,
      maxRedemptionsPerStream: 3,
      maxRedemptionsPerUserPerStream: 1,
      globalCooldown: 30,
    });
  });

  it("passes no limit along as a zero, which twurple turns into the flag Twitch wants", () => {
    expect(toRewardData({ ...draft, maxPerStream: 0, cooldown: 0 })).toMatchObject({
      maxRedemptionsPerStream: 0,
      globalCooldown: 0,
    });
  });
});

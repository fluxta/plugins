import type { HelixUpdateCustomRewardData } from "@twurple/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChannelPointsApi } from "./api";
import type { CustomRewardSource } from "./reward";
import { RewardsService } from "./service";

const CHANNEL = "channel-1";

function source(overrides: Partial<CustomRewardSource> = {}): CustomRewardSource {
  return {
    id: "reward-1",
    title: "Hydrate",
    cost: 500,
    prompt: "",
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

/** Twitch, as far as this service can tell. */
class FakeChannelPoints implements ChannelPointsApi {
  rewards: CustomRewardSource[] = [];
  /** The ids Twitch reports as created by this client id. */
  ours = new Set<string>();
  updates: { rewardId: string; data: HelixUpdateCustomRewardData }[] = [];
  resolutions: { rewardId: string; redemptionIds: string[]; status: string }[] = [];
  deleted: string[] = [];
  /** Thrown by the next write, to stand in for a refusal. */
  refuse?: Error;

  getCustomRewards(broadcaster: string, onlyManageable?: boolean) {
    expect(broadcaster).toBe(CHANNEL);
    return Promise.resolve(
      onlyManageable ? this.rewards.filter((reward) => this.ours.has(reward.id)) : this.rewards,
    );
  }

  createCustomReward(_broadcaster: string, data: { title: string; cost: number }) {
    this.refused();
    const created = source({ id: `reward-${this.rewards.length + 1}`, ...data });
    this.rewards.push(created);
    this.ours.add(created.id);
    return Promise.resolve(created);
  }

  updateCustomReward(_broadcaster: string, rewardId: string, data: HelixUpdateCustomRewardData) {
    this.refused();
    this.updates.push({ rewardId, data });

    const index = this.rewards.findIndex((reward) => reward.id === rewardId);
    const updated = source({
      ...this.rewards[index],
      ...(data.cost === undefined ? {} : { cost: data.cost }),
      ...(data.isEnabled === undefined ? {} : { isEnabled: data.isEnabled }),
    });

    this.rewards[index] = updated;
    return Promise.resolve(updated);
  }

  deleteCustomReward(_broadcaster: string, rewardId: string) {
    this.refused();
    this.deleted.push(rewardId);
    this.rewards = this.rewards.filter((reward) => reward.id !== rewardId);
    return Promise.resolve();
  }

  updateRedemptionStatusByIds(
    _broadcaster: string,
    rewardId: string,
    redemptionIds: string[],
    status: string,
  ) {
    this.refused();
    this.resolutions.push({ rewardId, redemptionIds, status });
    return Promise.resolve([]);
  }

  private refused(): void {
    if (this.refuse) {
      throw this.refuse;
    }
  }
}

describe("RewardsService", () => {
  let api: FakeChannelPoints;
  let channelId: string | undefined;
  let changes: number;
  let service: RewardsService;
  let errors: string[];
  let logs: string[];

  beforeEach(() => {
    api = new FakeChannelPoints();
    channelId = CHANNEL;
    changes = 0;
    service = new RewardsService(
      () => channelId,
      api,
      () => {
        changes += 1;
      },
    );

    // The log is where an Action reports itself, so it is part of what these
    // tests are checking rather than noise to be hidden.
    errors = [];
    logs = [];
    vi.spyOn(console, "error").mockImplementation((...args) => void errors.push(String(args[0])));
    vi.spyOn(console, "warn").mockImplementation((...args) => void errors.push(String(args[0])));
    vi.spyOn(console, "log").mockImplementation((...args) => void logs.push(String(args[0])));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function listed() {
    const state = service.snapshot();
    return state.status === "ready" ? state.rewards : [];
  }

  describe("the list", () => {
    it("stays idle with no broadcaster account, rather than failing", () => {
      channelId = undefined;
      service.sync();

      expect(service.snapshot()).toEqual({ status: "idle" });
    });

    it("marks a reward the plugin did not create as unmanaged", async () => {
      api.rewards = [source({ id: "ours" }), source({ id: "theirs", title: "Dashboard one" })];
      api.ours.add("ours");

      await service.refresh();

      expect(listed().map((reward) => [reward.title, reward.managed])).toEqual([
        ["Dashboard one", false],
        ["Hydrate", true],
      ]);
    });

    it("reports a channel it could not read, and does not pretend it is empty", async () => {
      vi.spyOn(api, "getCustomRewards").mockRejectedValue(new Error("Twitch is down"));

      await service.refresh();

      expect(service.snapshot()).toEqual({ status: "error", message: "Twitch is down" });
    });

    it("blames the failed read, not the reward, when an action cannot look one up", async () => {
      vi.spyOn(api, "getCustomRewards").mockRejectedValue(new Error("Twitch is down"));

      await service.change("ours", { enablement: "toggle" });

      expect(errors.join("\n")).toContain("Twitch is down");
      expect(errors.join("\n")).not.toContain("no reward with the id");
    });
  });

  describe("changing a reward", () => {
    beforeEach(async () => {
      api.rewards = [source({ id: "ours" }), source({ id: "theirs", title: "Dashboard one" })];
      api.ours.add("ours");
      await service.refresh();
    });

    it("turns an enabled reward off when told to toggle it", async () => {
      await service.change("ours", { enablement: "toggle" });

      expect(api.updates).toEqual([{ rewardId: "ours", data: { isEnabled: false } }]);
    });

    it("toggles from what Twitch says now, not from what was cached", async () => {
      // The streamer switched it off in the Twitch dashboard since the last
      // read; a toggle has to turn it back on.
      api.rewards = api.rewards.map((reward) =>
        reward.id === "ours" ? source({ ...reward, isEnabled: false }) : reward,
      );

      await service.change("ours", { enablement: "toggle" });

      expect(api.updates).toEqual([{ rewardId: "ours", data: { isEnabled: true } }]);
    });

    it("changes the cost without touching whether the reward is shown", async () => {
      await service.change("ours", { enablement: "unchanged", cost: 250 });

      expect(api.updates).toEqual([{ rewardId: "ours", data: { cost: 250 } }]);
    });

    it("says what it did, so the log tells the streamer the press landed", async () => {
      await service.change("ours", { enablement: "disable" });

      expect(logs.join("\n")).toContain("disabled");
    });

    it("refuses a reward created elsewhere, and explains why", async () => {
      await service.change("theirs", { enablement: "enable" });

      expect(api.updates).toEqual([]);
      expect(errors.join("\n")).toContain("created outside this plugin");
      expect(errors.join("\n")).toContain("Dashboard one");
    });

    it("says so when the reward is gone rather than failing silently", async () => {
      await service.change("missing", { enablement: "enable" });

      expect(api.updates).toEqual([]);
      expect(errors.join("\n")).toContain("no reward with the id missing");
    });

    it("does nothing, loudly, when the action asks for no change at all", async () => {
      await service.change("ours", { enablement: "unchanged" });

      expect(api.updates).toEqual([]);
      expect(errors.join("\n")).toContain("nothing to change");
    });

    it("keeps the list current, so the editor sees what the deck just did", async () => {
      await service.change("ours", { enablement: "disable" });

      expect(listed().find((reward) => reward.id === "ours")?.enabled).toBe(false);
    });
  });

  describe("resolving a redemption", () => {
    beforeEach(async () => {
      api.rewards = [source({ id: "ours" }), source({ id: "theirs", title: "Dashboard one" })];
      api.ours.add("ours");
      await service.refresh();
    });

    it("fulfils one", async () => {
      await service.resolve("ours", "redemption-1", "fulfill");

      expect(api.resolutions).toEqual([
        { rewardId: "ours", redemptionIds: ["redemption-1"], status: "FULFILLED" },
      ]);
    });

    it("refunds one by cancelling it, which is how Twitch returns the points", async () => {
      await service.resolve("ours", "redemption-1", "refund");

      expect(api.resolutions).toEqual([
        { rewardId: "ours", redemptionIds: ["redemption-1"], status: "CANCELED" },
      ]);
    });

    it("refuses a redemption of a reward created elsewhere, and explains why", async () => {
      await service.resolve("theirs", "redemption-1", "fulfill");

      expect(api.resolutions).toEqual([]);
      expect(errors.join("\n")).toContain("created outside this plugin");
    });

    it("reports what Twitch said when it would not resolve one", async () => {
      api.refuse = Object.assign(new Error("nope"), {
        statusCode: 400,
        body: '{"message":"The redemption is already fulfilled"}',
      });

      await service.resolve("ours", "redemption-1", "fulfill");

      expect(errors.join("\n")).toContain("The redemption is already fulfilled");
    });
  });

  describe("the plugin editor's writes", () => {
    it("adds a created reward to the list without reading the channel again", async () => {
      await service.refresh();
      const before = api.rewards.length;

      const refusal = await service.create({
        title: "Hydrate",
        cost: 500,
        prompt: "",
        userInputRequired: false,
        enabled: true,
        maxPerStream: 0,
        maxPerUserPerStream: 0,
        cooldown: 0,
      });

      expect(refusal).toBeUndefined();
      expect(api.rewards).toHaveLength(before + 1);
      // Created by this plugin, so manageable from the moment it exists.
      expect(listed().map((reward) => reward.managed)).toEqual([true]);
    });

    it("hands back what Twitch refused, in words the editor can show", async () => {
      api.refuse = Object.assign(new Error("nope"), {
        statusCode: 400,
        body: '{"message":"CREATE_CUSTOM_REWARD_DUPLICATE_REWARD"}',
      });

      const refusal = await service.create({
        title: "Hydrate",
        cost: 500,
        prompt: "",
        userInputRequired: false,
        enabled: true,
        maxPerStream: 0,
        maxPerUserPerStream: 0,
        cooldown: 0,
      });

      expect(refusal).toContain("CREATE_CUSTOM_REWARD_DUPLICATE_REWARD");
    });

    it("refuses every write with no broadcaster account, and says which to connect", async () => {
      channelId = undefined;

      expect(await service.remove("ours")).toContain("broadcaster account");
    });

    it("drops a deleted reward from the list", async () => {
      api.rewards = [source({ id: "ours" })];
      api.ours.add("ours");
      await service.refresh();

      expect(await service.remove("ours")).toBeUndefined();
      expect(listed()).toEqual([]);
    });

    it("tells the editor whenever the list changed", async () => {
      changes = 0;
      await service.refresh();

      expect(changes).toBeGreaterThan(0);
    });
  });
});

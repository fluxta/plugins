import { describe, expect, it } from "vitest";

import { toRaidReceivedPayload, type RaidReceivedSource } from "./raid-received";

function raid(overrides: Partial<RaidReceivedSource> = {}): RaidReceivedSource {
  return {
    raidingBroadcasterId: "42",
    raidingBroadcasterName: "raider",
    raidingBroadcasterDisplayName: "Raider",
    viewers: 250,
    ...overrides,
  };
}

describe("toRaidReceivedPayload", () => {
  it("carries the raiding channel's identity and the party size", () => {
    expect(toRaidReceivedPayload(raid())).toEqual({
      fromUserId: "42",
      fromUserLogin: "raider",
      fromUserName: "Raider",
      viewers: 250,
    });
  });
});

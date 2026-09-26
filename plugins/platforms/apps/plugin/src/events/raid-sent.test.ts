import { describe, expect, it } from "vitest";

import { toRaidSentPayload, type RaidSentSource } from "./raid-sent";

function raid(overrides: Partial<RaidSentSource> = {}): RaidSentSource {
  return {
    raidedBroadcasterId: "42",
    raidedBroadcasterName: "friend",
    raidedBroadcasterDisplayName: "Friend",
    viewers: 250,
    ...overrides,
  };
}

describe("toRaidSentPayload", () => {
  it("carries the raided channel's identity and the party size", () => {
    expect(toRaidSentPayload(raid())).toEqual({
      toUserId: "42",
      toUserLogin: "friend",
      toUserName: "Friend",
      viewers: 250,
    });
  });
});

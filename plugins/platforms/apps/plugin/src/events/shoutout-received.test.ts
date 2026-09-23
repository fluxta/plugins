import { describe, expect, it } from "vitest";

import { toShoutoutReceivedPayload, type ShoutoutReceivedSource } from "./shoutout-received";

function shoutout(overrides: Partial<ShoutoutReceivedSource> = {}): ShoutoutReceivedSource {
  return {
    shoutingOutBroadcasterId: "42",
    shoutingOutBroadcasterName: "friend",
    shoutingOutBroadcasterDisplayName: "Friend",
    viewerCount: 80,
    ...overrides,
  };
}

describe("toShoutoutReceivedPayload", () => {
  it("carries the shouting-out channel's identity and their viewer count", () => {
    expect(toShoutoutReceivedPayload(shoutout())).toEqual({
      fromUserId: "42",
      fromUserLogin: "friend",
      fromUserName: "Friend",
      viewerCount: 80,
    });
  });
});

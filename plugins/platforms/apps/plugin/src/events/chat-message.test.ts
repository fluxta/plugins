import { describe, expect, it } from "vitest";

import { toChatMessagePayload, type ChatMessageSource } from "./chat-message";

function message(overrides: Partial<ChatMessageSource> = {}): ChatMessageSource {
  return {
    messageId: "msg-1",
    messageText: "hello chat",
    chatterId: "42",
    chatterName: "viewer",
    chatterDisplayName: "Viewer",
    badges: {},
    ...overrides,
  };
}

describe("toChatMessagePayload", () => {
  it("carries the message, its author and its channel", () => {
    expect(toChatMessagePayload(message())).toMatchObject({
      message: "hello chat",
      messageId: "msg-1",
      userId: "42",
      userLogin: "viewer",
      userName: "Viewer",
    });
  });

  it("reports no standing for a plain viewer", () => {
    expect(toChatMessagePayload(message())).toMatchObject({
      isBroadcaster: false,
      isModerator: false,
      isVip: false,
      isSubscriber: false,
    });
  });

  it.each([
    ["broadcaster", "isBroadcaster"],
    ["moderator", "isModerator"],
    ["vip", "isVip"],
    ["subscriber", "isSubscriber"],
  ] as const)("reads the %s badge into %s", (badge, field) => {
    const payload = toChatMessagePayload(message({ badges: { [badge]: "1" } }));
    expect(payload[field]).toBe(true);
  });

  it("counts a founder as a subscriber", () => {
    // Early subscribers keep a founder badge instead of a subscriber one, and
    // a filter for subscribers is meant to include them.
    expect(toChatMessagePayload(message({ badges: { founder: "0" } })).isSubscriber).toBe(true);
  });

  it("keeps standings independent of each other", () => {
    const payload = toChatMessagePayload(
      message({ badges: { broadcaster: "1", subscriber: "12" } }),
    );

    expect(payload).toMatchObject({
      isBroadcaster: true,
      isSubscriber: true,
      isModerator: false,
      isVip: false,
    });
  });
});

import { describe, expect, it } from "vitest";

import { toMessageDeletedPayload, type MessageDeletedSource } from "./message-deleted";

function messageDeleted(overrides: Partial<MessageDeletedSource> = {}): MessageDeletedSource {
  return {
    messageId: "message-1",
    userId: "42",
    userName: "troll",
    userDisplayName: "Troll",
    ...overrides,
  };
}

describe("toMessageDeletedPayload", () => {
  it("carries which message was deleted and who wrote it", () => {
    expect(toMessageDeletedPayload(messageDeleted())).toEqual({
      messageId: "message-1",
      userId: "42",
      userLogin: "troll",
      userName: "Troll",
    });
  });
});

import { describe, expect, it } from "vitest";

import { toUserBannedPayload, type UserBannedSource } from "./user-banned";

function banned(overrides: Partial<UserBannedSource> = {}): UserBannedSource {
  return {
    userId: "42",
    userName: "troll",
    userDisplayName: "Troll",
    moderatorId: "7",
    moderatorName: "mod",
    moderatorDisplayName: "Mod",
    reason: "spamming",
    ...overrides,
  };
}

describe("toUserBannedPayload", () => {
  it("carries the banned viewer's identity, the moderator and the reason", () => {
    expect(toUserBannedPayload(banned())).toEqual({
      userId: "42",
      userLogin: "troll",
      userName: "Troll",
      moderatorId: "7",
      moderatorLogin: "mod",
      moderatorName: "Mod",
      reason: "spamming",
    });
  });
});

import { describe, expect, it } from "vitest";

import { toUserWarnedPayload, type UserWarnedSource } from "./user-warned";

function warned(overrides: Partial<UserWarnedSource> = {}): UserWarnedSource {
  return {
    userId: "42",
    userName: "troll",
    userDisplayName: "Troll",
    moderatorId: "7",
    moderatorName: "mod",
    moderatorDisplayName: "Mod",
    reason: "watch the language",
    ...overrides,
  };
}

describe("toUserWarnedPayload", () => {
  it("carries the warned viewer's identity, the moderator and the reason", () => {
    expect(toUserWarnedPayload(warned())).toEqual({
      userId: "42",
      userLogin: "troll",
      userName: "Troll",
      moderatorId: "7",
      moderatorLogin: "mod",
      moderatorName: "Mod",
      reason: "watch the language",
    });
  });

  it("reports no reason as an empty string, not null", () => {
    expect(toUserWarnedPayload(warned({ reason: null })).reason).toBe("");
  });
});

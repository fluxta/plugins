import { describe, expect, it } from "vitest";

import { toUserUnbannedPayload, type UserUnbannedSource } from "./user-unbanned";

function unbanned(overrides: Partial<UserUnbannedSource> = {}): UserUnbannedSource {
  return {
    userId: "42",
    userName: "reformed",
    userDisplayName: "Reformed",
    moderatorId: "7",
    moderatorName: "mod",
    moderatorDisplayName: "Mod",
    ...overrides,
  };
}

describe("toUserUnbannedPayload", () => {
  it("carries the unbanned viewer's identity and the moderator", () => {
    expect(toUserUnbannedPayload(unbanned())).toEqual({
      userId: "42",
      userLogin: "reformed",
      userName: "Reformed",
      moderatorId: "7",
      moderatorLogin: "mod",
      moderatorName: "Mod",
    });
  });
});

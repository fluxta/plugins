import { describe, expect, it } from "vitest";

import { toFollowPayload, type FollowSource } from "./follow";

function follow(overrides: Partial<FollowSource> = {}): FollowSource {
  return {
    userId: "42",
    userName: "viewer",
    userDisplayName: "Viewer",
    ...overrides,
  };
}

describe("toFollowPayload", () => {
  it("carries the following viewer's identity", () => {
    expect(toFollowPayload(follow())).toEqual({
      userId: "42",
      userLogin: "viewer",
      userName: "Viewer",
    });
  });
});

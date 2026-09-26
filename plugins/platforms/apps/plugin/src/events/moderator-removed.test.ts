import { describe, expect, it } from "vitest";

import { toModeratorRemovedPayload, type ModeratorRemovedSource } from "./moderator-removed";

function moderatorRemoved(overrides: Partial<ModeratorRemovedSource> = {}): ModeratorRemovedSource {
  return {
    userId: "42",
    userName: "exmod",
    userDisplayName: "ExMod",
    ...overrides,
  };
}

describe("toModeratorRemovedPayload", () => {
  it("carries the former moderator's identity", () => {
    expect(toModeratorRemovedPayload(moderatorRemoved())).toEqual({
      userId: "42",
      userLogin: "exmod",
      userName: "ExMod",
    });
  });
});

import { describe, expect, it } from "vitest";

import { toModeratorAddedPayload, type ModeratorAddedSource } from "./moderator-added";

function moderatorAdded(overrides: Partial<ModeratorAddedSource> = {}): ModeratorAddedSource {
  return {
    userId: "42",
    userName: "newmod",
    userDisplayName: "NewMod",
    ...overrides,
  };
}

describe("toModeratorAddedPayload", () => {
  it("carries the new moderator's identity", () => {
    expect(toModeratorAddedPayload(moderatorAdded())).toEqual({
      userId: "42",
      userLogin: "newmod",
      userName: "NewMod",
    });
  });
});

import { describe, expect, it } from "vitest";

import { toCheerPayload, type CheerSource } from "./cheer";

function cheer(overrides: Partial<CheerSource> = {}): CheerSource {
  return {
    userId: "42",
    userName: "viewer",
    userDisplayName: "Viewer",
    bits: 100,
    message: "Cheer100 nice stream!",
    isAnonymous: false,
    ...overrides,
  };
}

describe("toCheerPayload", () => {
  it("carries the cheerer's identity, the amount and the message", () => {
    expect(toCheerPayload(cheer())).toEqual({
      userId: "42",
      userLogin: "viewer",
      userName: "Viewer",
      bits: 100,
      message: "Cheer100 nice stream!",
      isAnonymous: false,
    });
  });

  it("reports an anonymous cheerer as empty identity fields, not null", () => {
    expect(
      toCheerPayload(cheer({ userId: null, userName: null, userDisplayName: null, isAnonymous: true })),
    ).toEqual({
      userId: "",
      userLogin: "",
      userName: "",
      bits: 100,
      message: "Cheer100 nice stream!",
      isAnonymous: true,
    });
  });
});

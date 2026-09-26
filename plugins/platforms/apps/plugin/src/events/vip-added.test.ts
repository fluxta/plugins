import { describe, expect, it } from "vitest";

import { toVipAddedPayload, type VipAddedSource } from "./vip-added";

function vipAdded(overrides: Partial<VipAddedSource> = {}): VipAddedSource {
  return {
    userId: "42",
    userName: "newvip",
    userDisplayName: "NewVip",
    ...overrides,
  };
}

describe("toVipAddedPayload", () => {
  it("carries the new VIP's identity", () => {
    expect(toVipAddedPayload(vipAdded())).toEqual({
      userId: "42",
      userLogin: "newvip",
      userName: "NewVip",
    });
  });
});

import { describe, expect, it } from "vitest";

import { toVipRemovedPayload, type VipRemovedSource } from "./vip-removed";

function vipRemoved(overrides: Partial<VipRemovedSource> = {}): VipRemovedSource {
  return {
    userId: "42",
    userName: "exvip",
    userDisplayName: "ExVip",
    ...overrides,
  };
}

describe("toVipRemovedPayload", () => {
  it("carries the former VIP's identity", () => {
    expect(toVipRemovedPayload(vipRemoved())).toEqual({
      userId: "42",
      userLogin: "exvip",
      userName: "ExVip",
    });
  });
});

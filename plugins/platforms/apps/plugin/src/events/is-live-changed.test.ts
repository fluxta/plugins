import { describe, expect, it } from "vitest";

import { toIsLiveChangedPayload } from "./is-live-changed";

describe("toIsLiveChangedPayload", () => {
  it("carries the new value, the channel and the platform", () => {
    expect(toIsLiveChangedPayload(true)).toEqual({
      isLive: true,
    });
  });

  it("keeps the boolean a boolean, so a condition can compare it directly", () => {
    expect(toIsLiveChangedPayload(false).isLive).toBe(false);
  });
});

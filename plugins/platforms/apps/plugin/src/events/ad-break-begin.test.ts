import { describe, expect, it } from "vitest";

import { toAdBreakBeginPayload, type AdBreakBeginSource } from "./ad-break-begin";

function adBreakBegin(overrides: Partial<AdBreakBeginSource> = {}): AdBreakBeginSource {
  return {
    durationSeconds: 90,
    isAutomatic: false,
    ...overrides,
  };
}

describe("toAdBreakBeginPayload", () => {
  it("carries the break's length and whether it was automatic", () => {
    expect(toAdBreakBeginPayload(adBreakBegin())).toEqual({
      durationSeconds: 90,
      isAutomatic: false,
    });
  });

  it("keeps isAutomatic a boolean, so a condition can compare it directly", () => {
    expect(toAdBreakBeginPayload(adBreakBegin({ isAutomatic: true })).isAutomatic).toBe(true);
  });
});

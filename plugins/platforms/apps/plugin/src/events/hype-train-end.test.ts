import { describe, expect, it } from "vitest";

import { toHypeTrainEndPayload, type HypeTrainEndSource } from "./hype-train-end";

function hypeTrainEnd(overrides: Partial<HypeTrainEndSource> = {}): HypeTrainEndSource {
  return {
    id: "train-1",
    level: 3,
    total: 4200,
    type: "regular",
    ...overrides,
  };
}

describe("toHypeTrainEndPayload", () => {
  it("carries the train's identity, final standing and kind", () => {
    expect(toHypeTrainEndPayload(hypeTrainEnd())).toEqual({
      hypeTrainId: "train-1",
      level: 3,
      total: 4200,
      trainType: "regular",
    });
  });
});

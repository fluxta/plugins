import { describe, expect, it } from "vitest";

import { toHypeTrainBeginPayload, type HypeTrainBeginSource } from "./hype-train-begin";

function hypeTrainBegin(overrides: Partial<HypeTrainBeginSource> = {}): HypeTrainBeginSource {
  return {
    id: "train-1",
    level: 1,
    total: 300,
    progress: 300,
    goal: 1000,
    type: "regular",
    ...overrides,
  };
}

describe("toHypeTrainBeginPayload", () => {
  it("carries the train's identity, standing and kind", () => {
    expect(toHypeTrainBeginPayload(hypeTrainBegin())).toEqual({
      hypeTrainId: "train-1",
      level: 1,
      total: 300,
      progress: 300,
      goal: 1000,
      trainType: "regular",
    });
  });
});

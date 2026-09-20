import { describe, expect, it } from "vitest";

import { toPredictionLockPayload, type PredictionLockSource } from "./prediction-lock";

function prediction(overrides: Partial<PredictionLockSource> = {}): PredictionLockSource {
  return {
    id: "prediction-1",
    title: "Do we win?",
    outcomes: [
      { title: "Yes", channelPoints: 4000 },
      { title: "No", channelPoints: 1500 },
    ],
    ...overrides,
  };
}

describe("toPredictionLockPayload", () => {
  it("carries the prediction's id, title and channel", () => {
    expect(toPredictionLockPayload(prediction())).toMatchObject({
      predictionId: "prediction-1",
      title: "Do we win?",
    });
  });

  it("spreads titles and the points wagered so far onto the numbered fields", () => {
    expect(toPredictionLockPayload(prediction())).toMatchObject({
      outcome1: "Yes",
      outcome1Points: 4000,
      outcome2: "No",
      outcome2Points: 1500,
      outcome3: "",
      outcome3Points: 0,
    });
  });
});

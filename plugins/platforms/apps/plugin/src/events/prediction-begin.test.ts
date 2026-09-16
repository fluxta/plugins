import { describe, expect, it } from "vitest";

import {
  toPredictionBeginPayload,
  type PredictionBeginSource,
} from "./prediction-begin";

function prediction(
  overrides: Partial<PredictionBeginSource> = {},
): PredictionBeginSource {
  return {
    id: "prediction-1",
    title: "Do we win?",
    outcomes: [{ title: "Yes" }, { title: "No" }],
    ...overrides,
  };
}

describe("toPredictionBeginPayload", () => {
  it("carries the prediction's id, title and channel", () => {
    expect(toPredictionBeginPayload(prediction())).toMatchObject({
      predictionId: "prediction-1",
      title: "Do we win?",
    });
  });

  it("spreads the outcomes onto the numbered fields, none of them points yet", () => {
    expect(toPredictionBeginPayload(prediction())).toMatchObject({
      outcome1: "Yes",
      outcome2: "No",
      outcome3: "",
      outcome10: "",
    });
  });
});

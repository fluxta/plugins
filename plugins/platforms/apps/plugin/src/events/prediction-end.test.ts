import { describe, expect, it } from "vitest";

import { toPredictionEndPayload, type PredictionEndSource } from "./prediction-end";

function prediction(overrides: Partial<PredictionEndSource> = {}): PredictionEndSource {
  return {
    id: "prediction-1",
    title: "Do we win?",
    outcomes: [
      { title: "Yes", channelPoints: 4000 },
      { title: "No", channelPoints: 1500 },
    ],
    status: "resolved",
    winningOutcome: { title: "Yes" },
    ...overrides,
  };
}

describe("toPredictionEndPayload", () => {
  it("carries the prediction's id, title, status and channel", () => {
    expect(toPredictionEndPayload(prediction())).toMatchObject({
      predictionId: "prediction-1",
      title: "Do we win?",
      status: "resolved",
    });
  });

  it("spreads titles and points onto the numbered fields", () => {
    expect(toPredictionEndPayload(prediction())).toMatchObject({
      outcome1: "Yes",
      outcome1Points: 4000,
      outcome2: "No",
      outcome2Points: 1500,
    });
  });

  it("names the winner by title, never by Twitch's outcome id", () => {
    const payload = toPredictionEndPayload(prediction());

    expect(payload.winner).toBe("Yes");
    expect(JSON.stringify(payload)).not.toContain("outcomeId");
  });

  it("reports an empty winner when the prediction was canceled, rather than guessing", () => {
    const payload = toPredictionEndPayload(
      prediction({ status: "canceled", winningOutcome: null }),
    );

    expect(payload.winner).toBe("");
    expect(payload.status).toBe("canceled");
  });
});

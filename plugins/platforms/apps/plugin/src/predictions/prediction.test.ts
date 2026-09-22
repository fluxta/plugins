import { describe, expect, it } from "vitest";

import { toCreatePredictionData } from "./prediction";

describe("toCreatePredictionData", () => {
  it("sends what Twitch takes to create a prediction", () => {
    expect(
      toCreatePredictionData({ title: "Do we win?", outcomes: ["Yes", "No"], duration: 120 }),
    ).toEqual({
      title: "Do we win?",
      outcomes: ["Yes", "No"],
      autoLockAfter: 120,
    });
  });
});

import { describe, expect, it } from "vitest";

import { outcomePointFields, outcomeTitleFields } from "./prediction-outcome-fields";

describe("outcomeTitleFields", () => {
  it("spreads titles onto the ten numbered slots", () => {
    expect(outcomeTitleFields([{ title: "Win" }, { title: "Lose" }])).toEqual({
      outcome1: "Win",
      outcome2: "Lose",
      outcome3: "",
      outcome4: "",
      outcome5: "",
      outcome6: "",
      outcome7: "",
      outcome8: "",
      outcome9: "",
      outcome10: "",
    });
  });

  it("fills every slot when the prediction used all ten", () => {
    const outcomes = Array.from({ length: 10 }, (_, i) => ({ title: `Outcome ${i + 1}` }));

    const fields = outcomeTitleFields(outcomes);

    expect(fields.outcome1).toBe("Outcome 1");
    expect(fields.outcome10).toBe("Outcome 10");
  });
});

describe("outcomePointFields", () => {
  it("spreads channel points onto the ten numbered slots, unused ones reporting zero", () => {
    expect(outcomePointFields([{ channelPoints: 500 }, { channelPoints: 1200 }])).toEqual({
      outcome1Points: 500,
      outcome2Points: 1200,
      outcome3Points: 0,
      outcome4Points: 0,
      outcome5Points: 0,
      outcome6Points: 0,
      outcome7Points: 0,
      outcome8Points: 0,
      outcome9Points: 0,
      outcome10Points: 0,
    });
  });
});

import { describe, expect, it } from "vitest";

import { toCreatePollData } from "./poll";

describe("toCreatePollData", () => {
  it("sends what Twitch takes to create a poll", () => {
    expect(
      toCreatePollData({ title: "Who wins?", choices: ["Team A", "Team B"], duration: 60 }),
    ).toEqual({
      title: "Who wins?",
      choices: ["Team A", "Team B"],
      duration: 60,
    });
  });
});

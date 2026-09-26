import { describe, expect, it } from "vitest";

import { toPollBeginPayload, type PollBeginSource } from "./poll-begin";

function poll(overrides: Partial<PollBeginSource> = {}): PollBeginSource {
  return {
    id: "poll-1",
    title: "Who wins?",
    choices: [{ title: "Team A" }, { title: "Team B" }],
    ...overrides,
  };
}

describe("toPollBeginPayload", () => {
  it("carries the poll's id, title and channel", () => {
    expect(toPollBeginPayload(poll())).toMatchObject({
      pollId: "poll-1",
      title: "Who wins?",
    });
  });

  it("spreads the choices onto the numbered fields, none of them votes", () => {
    expect(toPollBeginPayload(poll())).toMatchObject({
      choice1: "Team A",
      choice2: "Team B",
      choice3: "",
      choice4: "",
      choice5: "",
    });
  });
});

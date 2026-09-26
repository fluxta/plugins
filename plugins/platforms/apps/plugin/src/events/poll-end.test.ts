import { describe, expect, it } from "vitest";

import { toPollEndPayload, type PollEndSource } from "./poll-end";

function poll(overrides: Partial<PollEndSource> = {}): PollEndSource {
  return {
    id: "poll-1",
    title: "Who wins?",
    choices: [
      { title: "Team A", totalVotes: 12 },
      { title: "Team B", totalVotes: 30 },
    ],
    status: "completed",
    ...overrides,
  };
}

describe("toPollEndPayload", () => {
  it("carries the poll's id, title, status and channel", () => {
    expect(toPollEndPayload(poll())).toMatchObject({
      pollId: "poll-1",
      title: "Who wins?",
      status: "completed",
    });
  });

  it("spreads titles and votes onto the numbered fields", () => {
    expect(toPollEndPayload(poll())).toMatchObject({
      choice1: "Team A",
      choice1Votes: 12,
      choice2: "Team B",
      choice2Votes: 30,
      choice3: "",
      choice3Votes: 0,
    });
  });

  it("names the winner by title, never by Twitch's choice id", () => {
    const payload = toPollEndPayload(poll());

    expect(payload.winner).toBe("Team B");
    expect(JSON.stringify(payload)).not.toContain("choiceId");
  });

  it("reports how the poll ended, in Twitch's own words", () => {
    expect(toPollEndPayload(poll({ status: "terminated" })).status).toBe("terminated");
  });
});

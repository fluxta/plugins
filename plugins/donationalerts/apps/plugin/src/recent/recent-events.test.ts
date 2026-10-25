import { describe, expect, it } from "vitest";

import { RecentEvents } from "./recent-events";

function donation(donationId: number, isTest = false) {
  return {
    donationId,
    username: "Mike",
    message: "Hi",
    messageType: "text",
    amount: 100,
    currency: "RUB",
    isTest,
  };
}

const GOAL = {
  goalId: 7,
  title: "New microphone",
  isActive: true,
  currency: "RUB",
  startAmount: 0,
  raisedAmount: 3500,
  goalAmount: 10000,
};

describe("RecentEvents", () => {
  it("starts empty", () => {
    expect(new RecentEvents().list()).toEqual([]);
  });

  it("lists Donations and Goal updates newest first, with how each came", () => {
    let now = 1000;
    const recent = new RecentEvents(() => now++);

    recent.donation(donation(1), "live");
    recent.goal(GOAL);
    recent.donation(donation(2), "catch-up");
    recent.donation(donation(0, true), "test");

    expect(recent.list()).toEqual([
      {
        kind: "donation",
        at: 1003,
        delivery: "test",
        fields: donation(0, true),
      },
      { kind: "donation", at: 1002, delivery: "catch-up", fields: donation(2) },
      { kind: "goal", at: 1001, fields: GOAL },
      { kind: "donation", at: 1000, delivery: "live", fields: donation(1) },
    ]);
  });

  it("keeps only the newest twenty", () => {
    const recent = new RecentEvents();

    for (let id = 1; id <= 25; id++) {
      recent.donation(donation(id), "live");
    }

    const ids = recent
      .list()
      .map((entry) =>
        entry.kind === "donation" ? entry.fields.donationId : undefined,
      );
    expect(ids).toHaveLength(20);
    expect(ids[0]).toBe(25);
    expect(ids.at(-1)).toBe(6);
  });
});

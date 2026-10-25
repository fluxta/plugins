import { describe, expect, it } from "vitest";

import { toGoalUpdated } from "./goal-updated";

/** A goal publication in the shape DonationAlerts documents. */
const PUBLICATION = {
  id: 5481,
  is_active: 1,
  title: "New microphone",
  currency: "RUB",
  start_amount: 0,
  raised_amount: 3500,
  goal_amount: 10000,
  started_at: "2026-10-01 12.00.00",
  expires_at: null,
  reason: "default",
};

describe("toGoalUpdated", () => {
  it("maps the documented fields and nothing else", () => {
    expect(toGoalUpdated(PUBLICATION)).toEqual({
      goalId: 5481,
      title: "New microphone",
      isActive: true,
      currency: "RUB",
      startAmount: 0,
      raisedAmount: 3500,
      goalAmount: 10000,
    });
  });

  it("reads a closed Goal as inactive", () => {
    expect(toGoalUpdated({ ...PUBLICATION, is_active: 0 })).toMatchObject({
      isActive: false,
    });
    expect(toGoalUpdated({ ...PUBLICATION, is_active: false })).toMatchObject({
      isActive: false,
    });
  });

  it("reports a reached Goal as it is — the scenario compares the amounts", () => {
    expect(
      toGoalUpdated({ ...PUBLICATION, raised_amount: 12000 }),
    ).toMatchObject({ raisedAmount: 12000, goalAmount: 10000 });
  });

  it("reads amounts sent as numeric strings", () => {
    expect(
      toGoalUpdated({ ...PUBLICATION, raised_amount: "3500.50" }),
    ).toMatchObject({ raisedAmount: 3500.5 });
  });

  it("skips what is not a Goal", () => {
    expect(toGoalUpdated(null)).toBeUndefined();
    expect(toGoalUpdated({ ...PUBLICATION, is_active: "yes" })).toBeUndefined();
    expect(
      toGoalUpdated({ ...PUBLICATION, goal_amount: undefined }),
    ).toBeUndefined();
  });
});

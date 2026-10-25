import { describe, expect, it } from "vitest";

import { testDonationProblems } from "./test-donation";

const DRAFT = {
  username: "Mike",
  amount: 100,
  currency: "RUB",
  message: "Hello",
};

describe("testDonationProblems", () => {
  it("passes a draft that reads like a real Donation", () => {
    expect(testDonationProblems(DRAFT)).toEqual({});
    expect(
      testDonationProblems({ ...DRAFT, username: "", message: "" }),
    ).toEqual({});
    expect(testDonationProblems({ ...DRAFT, currency: " USD " })).toEqual({});
  });

  it("refuses an amount that is no amount", () => {
    for (const amount of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(testDonationProblems({ ...DRAFT, amount })).toHaveProperty(
        "amount",
      );
    }
  });

  it("refuses a currency that is not an ISO 4217 code", () => {
    for (const currency of ["", "rub", "RUBL", "₽"]) {
      expect(testDonationProblems({ ...DRAFT, currency })).toHaveProperty(
        "currency",
      );
    }
  });
});

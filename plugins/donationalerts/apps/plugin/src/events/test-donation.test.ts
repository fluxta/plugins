import { describe, expect, it } from "vitest";

import { toTestDonation } from "./test-donation";

describe("toTestDonation", () => {
  it("is Donation Received with the entered fields, marked as a test", () => {
    expect(
      toTestDonation({
        username: "Mike",
        amount: 250,
        currency: " USD ",
        message: "Is this on?",
      }),
    ).toEqual({
      donationId: 0,
      username: "Mike",
      message: "Is this on?",
      messageType: "text",
      amount: 250,
      currency: "USD",
      isTest: true,
    });
  });
});

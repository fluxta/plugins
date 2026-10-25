import type { TestDonationDraft } from "donationalerts-protocol";

import type { DonationReceivedPayload } from "./donation-received";

/**
 * A Test Donation as Donation Received: the fields the streamer made up,
 * `isTest` set, and `donationId` 0 — DonationAlerts never numbered it.
 *
 * It is fired straight from here, past the donation feed: a Test Donation
 * moves no Catch-up boundary and is never taken for a duplicate, so the same
 * test can be sent as often as a scenario needs trying.
 */
export function toTestDonation(
  draft: TestDonationDraft,
): DonationReceivedPayload {
  return {
    donationId: 0,
    username: draft.username,
    message: draft.message,
    messageType: "text",
    amount: draft.amount,
    currency: draft.currency.trim(),
    isTest: true,
  };
}

import { describe, expect, it } from "vitest";

import { toDonationReceived } from "./donation-received";

/** A publication as DonationAlerts sent it during the spike. */
const PUBLICATION = {
  id: 193057136,
  name: "Donations",
  username: "Mike",
  message: "Тест",
  message_type: "text",
  payin_system: null,
  amount: 100,
  currency: "RUB",
  is_shown: 0,
  amount_in_user_currency: 100,
  recipient_name: "MikeRime",
  recipient: {
    user_id: 10111687,
    code: "mikerime",
    name: "MikeRime",
    avatar: "https://example.com/avatar.png",
  },
  created_at: "2026-10-25 10:20:09",
  shown_at: null,
  reason: "default",
};

describe("toDonationReceived", () => {
  it("maps the documented fields and nothing else", () => {
    expect(toDonationReceived(PUBLICATION)).toEqual({
      donationId: 193057136,
      username: "Mike",
      message: "Тест",
      messageType: "text",
      amount: 100,
      currency: "RUB",
      isTest: false,
    });
  });

  it("keeps an audio Donation's message as sent, empty when there is none", () => {
    expect(
      toDonationReceived({
        ...PUBLICATION,
        message_type: "audio",
        message: null,
      }),
    ).toMatchObject({ messageType: "audio", message: "" });
    expect(
      toDonationReceived({ ...PUBLICATION, message_type: "audio" }),
    ).toMatchObject({ messageType: "audio", message: "Тест" });
  });

  it("takes a missing donor name as empty", () => {
    expect(
      toDonationReceived({ ...PUBLICATION, username: null }),
    ).toMatchObject({ username: "" });
  });

  it("reads an amount sent as a numeric string", () => {
    expect(
      toDonationReceived({ ...PUBLICATION, amount: "99.50" }),
    ).toMatchObject({ amount: 99.5 });
  });

  it("skips what is not a Donation", () => {
    expect(toDonationReceived(null)).toBeUndefined();
    expect(
      toDonationReceived({ ...PUBLICATION, amount: "lots" }),
    ).toBeUndefined();
    expect(
      toDonationReceived({ ...PUBLICATION, id: undefined }),
    ).toBeUndefined();
    expect(
      toDonationReceived({ ...PUBLICATION, currency: undefined }),
    ).toBeUndefined();
  });
});

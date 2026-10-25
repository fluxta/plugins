import type { DonationReceivedFields } from "donationalerts-protocol";
import { z } from "zod";

import { Numeric } from "./numeric";

export const DONATION_RECEIVED = "donation-received";

/** Every Event Field the manifest declares for Donation Received. */
export type DonationReceivedPayload = DonationReceivedFields;

/**
 * Only the fields DonationAlerts documents. Its publications carry more —
 * `amount_in_user_currency`, `payin_system`, `recipient` … — and the plugin
 * depends on none of them, so their changing can break nothing.
 */
const DonationSchema = z.object({
  id: Numeric,
  username: z.string().nullish(),
  message: z.string().nullish(),
  message_type: z.string(),
  amount: Numeric,
  currency: z.string(),
});

/**
 * A publication on the donation channel as Donation Received, or `undefined`
 * when it is not a Donation the plugin can read.
 *
 * `amount` is in the donor's currency: DonationAlerts documents no amount in
 * the streamer's own, so a Condition on the amount also needs one on
 * `currency`.
 */
export function toDonationReceived(
  data: unknown,
): DonationReceivedPayload | undefined {
  const parsed = DonationSchema.safeParse(data);

  if (!parsed.success) {
    return undefined;
  }

  const donation = parsed.data;
  return {
    donationId: donation.id,
    username: donation.username ?? "",
    // An audio Donation may come without text.
    message: donation.message ?? "",
    messageType: donation.message_type,
    amount: donation.amount,
    currency: donation.currency,
    isTest: false,
  };
}

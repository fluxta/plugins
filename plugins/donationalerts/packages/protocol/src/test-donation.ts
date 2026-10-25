import { z } from "zod";

/**
 * What the Plugin Editor's Test Donation form sends: a Donation as the
 * streamer makes it up. The plugin fires it as Donation Received with
 * `isTest` set; it never reaches DonationAlerts.
 */
export const TestDonationDraftSchema = z.object({
  username: z.string(),
  amount: z.number(),
  currency: z.string(),
  message: z.string(),
});

export type TestDonationDraft = z.infer<typeof TestDonationDraftSchema>;

/** Why a draft cannot be sent, field by field; empty when it can. */
export type TestDonationProblems = Partial<
  Record<keyof TestDonationDraft, string>
>;

/**
 * The checks both sides run: the editor to show them beside the fields, the
 * sidecar because a message is untrusted. A currency is an ISO 4217 code —
 * what DonationAlerts sends, so a Condition on `currency` reads a Test
 * Donation as it reads a real one.
 */
export function testDonationProblems(
  draft: TestDonationDraft,
): TestDonationProblems {
  const problems: TestDonationProblems = {};

  if (!Number.isFinite(draft.amount) || draft.amount <= 0) {
    problems.amount = "An amount above zero.";
  }

  if (!/^[A-Z]{3}$/.test(draft.currency.trim())) {
    problems.currency = "A three-letter currency code, such as RUB or USD.";
  }

  return problems;
}

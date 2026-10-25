import { z } from "zod";

/**
 * The Event Fields of Donation Received, as the manifest declares them —
 * what the sidecar fires and what Recent Events shows.
 */
export const DonationReceivedFieldsSchema = z.object({
  donationId: z.number(),
  username: z.string(),
  message: z.string(),
  messageType: z.string(),
  amount: z.number(),
  currency: z.string(),
  isTest: z.boolean(),
});

export type DonationReceivedFields = z.infer<
  typeof DonationReceivedFieldsSchema
>;

/** The Event Fields of Goal Updated, as the manifest declares them. */
export const GoalUpdatedFieldsSchema = z.object({
  goalId: z.number(),
  title: z.string(),
  isActive: z.boolean(),
  currency: z.string(),
  startAmount: z.number(),
  raisedAmount: z.number(),
  goalAmount: z.number(),
});

export type GoalUpdatedFields = z.infer<typeof GoalUpdatedFieldsSchema>;

/**
 * One Event the plugin fired in this run, as Recent Events lists it. A
 * Donation says how it came: live (from the donation channel, its history
 * included), by Catch-up, or as a Test Donation — which the Event itself
 * does not say, except through `isTest`.
 */
export const RecentEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("donation"),
    /** Epoch milliseconds when the plugin fired it. */
    at: z.number(),
    delivery: z.enum(["live", "catch-up", "test"]),
    fields: DonationReceivedFieldsSchema,
  }),
  z.object({
    kind: z.literal("goal"),
    at: z.number(),
    fields: GoalUpdatedFieldsSchema,
  }),
]);

export type RecentEvent = z.infer<typeof RecentEventSchema>;

/** How many Recent Events the plugin keeps. */
export const RECENT_EVENTS_LIMIT = 20;

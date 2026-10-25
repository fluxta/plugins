import { z } from "zod";

/**
 * How the Realtime Connection stands, as the Plugin Editor sees it. Present
 * only while an Account is signed in.
 *
 * `reconnecting` is normal and resolves itself. When DonationAlerts refuses
 * the token there is no Realtime Connection at all: the Account is then
 * Reauthorization Required.
 */
export const RealtimeStateSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("connecting") }),
  z.object({ status: z.literal("connected") }),
  z.object({ status: z.literal("reconnecting"), reason: z.string() }),
]);

export type RealtimeState = z.infer<typeof RealtimeStateSchema>;

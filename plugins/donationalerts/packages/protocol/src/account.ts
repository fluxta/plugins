import { z } from "zod";

/**
 * The Account as the Plugin Editor sees it. Never carries the token: an
 * editor only learns whether an Account exists and whose it is.
 *
 * `problem` on `signed-out` is why the last Sign-in failed. It belongs to the
 * state rather than to a one-off message because a Sign-in takes minutes in a
 * browser, and the editor may have been closed and reopened meanwhile.
 */
export const AccountStateSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("signed-out"),
    problem: z.string().optional(),
  }),
  z.object({
    status: z.literal("signing-in"),
    /** Shown in case the browser did not open on its own. */
    authorizeUrl: z.string(),
  }),
  z.object({
    status: z.literal("signed-in"),
    name: z.string(),
    avatar: z.string(),
    /** Epoch milliseconds: the Account's Sign-in Expiry. */
    expiresAt: z.number(),
  }),
  /**
   * The Account needs a new Sign-in: its Sign-in Expiry has passed
   * (`expired`), or DonationAlerts refused its token (`refused`). The
   * identity stays so the editor can say whose account to sign in again.
   */
  z.object({
    status: z.literal("reauthorization-required"),
    name: z.string(),
    avatar: z.string(),
    reason: z.enum(["expired", "refused"]),
    expiresAt: z.number(),
  }),
]);

export type AccountState = z.infer<typeof AccountStateSchema>;

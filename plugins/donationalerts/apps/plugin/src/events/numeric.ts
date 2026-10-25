import { z } from "zod";

/** A number DonationAlerts may also send as a numeric string. */
export const Numeric = z.union([
  z.number(),
  z
    .string()
    .regex(/^-?\d+(\.\d+)?$/)
    .transform(Number),
]);

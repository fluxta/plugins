/** How long before its Sign-in Expiry the Plugin Editor warns of it. */
export const EXPIRY_WARNING_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The whole days left until a Sign-in Expiry, counting a part day as one —
 * but only within the last `EXPIRY_WARNING_DAYS`; earlier there is nothing
 * to warn about and the editor shows just the date.
 */
export function daysUntilExpiry(
  expiresAt: number,
  now: number,
): number | undefined {
  const remaining = expiresAt - now;

  if (remaining <= 0 || remaining >= EXPIRY_WARNING_DAYS * DAY_MS) {
    return undefined;
  }

  return Math.ceil(remaining / DAY_MS);
}

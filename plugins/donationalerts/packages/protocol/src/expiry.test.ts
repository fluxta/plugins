import { describe, expect, it } from "vitest";

import { daysUntilExpiry, EXPIRY_WARNING_DAYS } from "./expiry";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_760_000_000_000;

describe("daysUntilExpiry", () => {
  it("says nothing until the last fourteen days", () => {
    expect(daysUntilExpiry(NOW + 200 * DAY, NOW)).toBeUndefined();
    expect(
      daysUntilExpiry(NOW + EXPIRY_WARNING_DAYS * DAY, NOW),
    ).toBeUndefined();
  });

  it("counts the days left within them, a part day as one", () => {
    expect(daysUntilExpiry(NOW + EXPIRY_WARNING_DAYS * DAY - 1, NOW)).toBe(14);
    expect(daysUntilExpiry(NOW + 3 * DAY, NOW)).toBe(3);
    expect(daysUntilExpiry(NOW + 1, NOW)).toBe(1);
  });

  it("says nothing once the expiry has passed — the Account is no longer signed in", () => {
    expect(daysUntilExpiry(NOW, NOW)).toBeUndefined();
    expect(daysUntilExpiry(NOW - DAY, NOW)).toBeUndefined();
  });
});

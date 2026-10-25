import { describe, expect, it } from "vitest";

import { retryDelay } from "./retry";

describe("retryDelay", () => {
  it("doubles from 1 s up to 60 s", () => {
    const longest = (attempt: number) => retryDelay(attempt, () => 0);

    expect([0, 1, 2, 3, 4, 5, 6, 7, 20].map(longest)).toEqual([
      1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000, 60_000,
    ]);
  });

  it("shortens each wait by up to half at random", () => {
    expect(retryDelay(0, () => 0.999999)).toBe(500);
    expect(retryDelay(6, () => 0.5)).toBe(45_000);
  });
});

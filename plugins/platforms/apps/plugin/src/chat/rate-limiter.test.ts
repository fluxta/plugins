import { describe, expect, it } from "vitest";

import { ELEVATED_LIMIT, RateLimiter, REGULAR_LIMIT } from "./rate-limiter";

describe("RateLimiter", () => {
  it("lets the first message go immediately", () => {
    expect(new RateLimiter(REGULAR_LIMIT).delayBefore(0)).toBe(0);
  });

  it("holds a second message for the rest of the one-second gap", () => {
    const limiter = new RateLimiter(REGULAR_LIMIT);
    limiter.record(0);

    expect(limiter.delayBefore(0)).toBe(1000);
    expect(limiter.delayBefore(400)).toBe(600);
    expect(limiter.delayBefore(1000)).toBe(0);
  });

  it("holds back once the window is full", () => {
    const limiter = new RateLimiter(REGULAR_LIMIT);

    // Twenty messages, one per second, fills the 30-second window.
    for (let i = 0; i < 20; i++) {
      limiter.record(i * 1000);
    }

    // The last went at 19s; the gap is satisfied by 20s, but the window is
    // full until the one sent at 0s ages out at 30s.
    expect(limiter.delayBefore(20_000)).toBe(10_000);
  });

  it("releases as the window slides", () => {
    const limiter = new RateLimiter(REGULAR_LIMIT);

    for (let i = 0; i < 20; i++) {
      limiter.record(i * 1000);
    }

    expect(limiter.delayBefore(30_000)).toBe(0);
  });

  it("keeps only the one-per-second gap for an elevated account", () => {
    const limiter = new RateLimiter(ELEVATED_LIMIT);

    // A pace the regular window cap would have blocked long ago.
    for (let i = 0; i < 25; i++) {
      limiter.record(i * 1000);
    }

    expect(limiter.delayBefore(25_000)).toBe(0);
  });

  it("still caps an elevated account at its larger window", () => {
    const limiter = new RateLimiter(ELEVATED_LIMIT);

    for (let i = 0; i < 100; i++) {
      limiter.record(i * 10);
    }

    expect(limiter.delayBefore(1000)).toBe(30_000 - 1000);
  });

  it("forgets messages that aged out rather than growing forever", () => {
    const limiter = new RateLimiter(REGULAR_LIMIT);

    for (let i = 0; i < 100; i++) {
      limiter.record(i * 2000);
    }

    // Two seconds apart, so at most 15 fit in a 30-second window and the
    // cap is never the reason to wait.
    expect(limiter.delayBefore(200_000)).toBe(0);
  });
});

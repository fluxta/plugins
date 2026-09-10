import { describe, expect, it } from "vitest";

import { Backoff } from "./backoff";

describe("Backoff", () => {
  it("starts at one second", () => {
    expect(new Backoff().next()).toBe(1000);
  });

  it("doubles on every call", () => {
    const backoff = new Backoff();
    expect(backoff.next()).toBe(1000);
    expect(backoff.next()).toBe(2000);
    expect(backoff.next()).toBe(4000);
    expect(backoff.next()).toBe(8000);
  });

  it("caps at thirty seconds", () => {
    const backoff = new Backoff();
    for (let i = 0; i < 10; i++) backoff.next();
    expect(backoff.next()).toBe(30_000);
  });

  it("starts over from one second after reset", () => {
    const backoff = new Backoff();
    backoff.next();
    backoff.next();
    backoff.reset();
    expect(backoff.next()).toBe(1000);
  });
});

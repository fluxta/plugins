import { describe, expect, it, vi } from "vitest";

import { resolveMode } from "./mode";

describe("resolveMode", () => {
  it("resolves show/enable to true without reading the current value", async () => {
    const getCurrent = vi.fn();
    expect(await resolveMode("show", getCurrent)).toBe(true);
    expect(await resolveMode("enable", getCurrent)).toBe(true);
    expect(getCurrent).not.toHaveBeenCalled();
  });

  it("resolves hide/disable to false without reading the current value", async () => {
    const getCurrent = vi.fn();
    expect(await resolveMode("hide", getCurrent)).toBe(false);
    expect(await resolveMode("disable", getCurrent)).toBe(false);
    expect(getCurrent).not.toHaveBeenCalled();
  });

  it("flips the current value for toggle", async () => {
    expect(await resolveMode("toggle", () => Promise.resolve(true))).toBe(false);
    expect(await resolveMode("toggle", () => Promise.resolve(false))).toBe(true);
  });

  it("resolves to undefined when no mode is configured", async () => {
    expect(await resolveMode(undefined, vi.fn())).toBeUndefined();
  });
});

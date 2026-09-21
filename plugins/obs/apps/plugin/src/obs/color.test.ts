import { describe, expect, it } from "vitest";

import { hexToObsColor, randomObsColor } from "./color";

describe("hexToObsColor", () => {
  it("packs #RRGGBB into a signed 32-bit ABGR int with full alpha", () => {
    // 0xAABBGGRR with A=ff, B=00, G=80, R=ff, read as signed 32-bit.
    expect(hexToObsColor("#ff8000")).toBe(0xff0080ff | 0);
  });

  it("accepts a hex value without the leading #", () => {
    expect(hexToObsColor("ff8000")).toBe(hexToObsColor("#ff8000"));
  });

  it("is case-insensitive", () => {
    expect(hexToObsColor("#FF8000")).toBe(hexToObsColor("#ff8000"));
  });

  it("rejects anything that isn't a 6-digit hex color", () => {
    expect(() => hexToObsColor("not-a-color")).toThrow();
    expect(() => hexToObsColor("#fff")).toThrow();
  });
});

describe("randomObsColor", () => {
  it("always returns full alpha", () => {
    for (let i = 0; i < 20; i++) {
      expect(randomObsColor() & 0xff000000).toBe(0xff000000 | 0);
    }
  });
});

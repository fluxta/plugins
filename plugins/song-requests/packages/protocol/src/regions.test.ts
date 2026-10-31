import { describe, expect, it } from "vitest";

import { isRegion, REGIONS } from "./regions";

describe("the Regions", () => {
  it("are the countries of ISO 3166-1, each once", () => {
    expect(REGIONS).toHaveLength(249);
    expect(new Set(REGIONS).size).toBe(249);
    expect(REGIONS).toContain("US");
    expect(REGIONS).toContain("RU");
  });

  it("are told from what is not one", () => {
    expect(isRegion("DE")).toBe(true);
    expect(isRegion("de")).toBe(false);
    // Latin America and the European Union are regions, not countries.
    expect(isRegion("419")).toBe(false);
    expect(isRegion("EU")).toBe(false);
    expect(isRegion(undefined)).toBe(false);
  });
});

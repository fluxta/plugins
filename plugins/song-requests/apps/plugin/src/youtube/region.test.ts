import { describe, expect, it } from "vitest";

import { regionOf } from "./region";

describe("the Region of a locale", () => {
  it.each([
    ["en-US", "US"],
    ["ru-RU", "RU"],
    // A locale without a country takes its language's own.
    ["de", "DE"],
    ["en-US-u-va-posix", "US"],
    // macOS writes its own with an underscore, and a Region picked apart
    // from the language as `@rg=`.
    ["ru_RU", "RU"],
    ["en_GB@rg=dezzzz", "DE"],
  ])("for %s is %s", (locale, region) => {
    expect(regionOf(locale)).toBe(region);
  });

  it.each([["es-419"], ["not a locale"], [""]])(
    "falls back to US for %j, which names no country",
    (locale) => {
      expect(regionOf(locale)).toBe("US");
    },
  );
});

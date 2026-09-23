import { describe, expect, it } from "vitest";

import { hasRequiredScopes, scopesFor } from "./config";

describe("hasRequiredScopes", () => {
  it("accepts a token that carries every scope the role currently needs", () => {
    expect(hasRequiredScopes("broadcaster", scopesFor("broadcaster"))).toBe(true);
  });

  it("accepts a token that carries extra scopes beyond what is required", () => {
    expect(hasRequiredScopes("broadcaster", [...scopesFor("broadcaster"), "channel:bot"])).toBe(
      true,
    );
  });

  it("refuses a token missing a scope a shipped feature added later", () => {
    const stale = scopesFor("broadcaster").filter((scope) => scope !== "bits:read");

    expect(hasRequiredScopes("broadcaster", stale)).toBe(false);
  });

  it("refuses an empty scope list", () => {
    expect(hasRequiredScopes("bot", [])).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { explainTwitchError } from "./errors";

/** What twurple throws: a long message, plus the status and the raw body. */
function httpError(statusCode: number, body: string): Error {
  const error = new Error(
    `Encountered HTTP status code ${statusCode}: Forbidden\n\nURL: https://api.twitch.tv/helix/x\nMethod: PATCH\nBody:\n${body}`,
  );
  return Object.assign(error, { statusCode, body });
}

describe("explainTwitchError", () => {
  it("says what Twitch said, not how it was asked", () => {
    const error = httpError(
      403,
      '{"error":"Forbidden","status":403,"message":"The ID in the Client-Id header must match the client ID used to create the custom reward."}',
    );

    expect(explainTwitchError(error)).toBe(
      "The ID in the Client-Id header must match the client ID used to create the custom reward. (HTTP 403)",
    );
  });

  it("keeps the status, so a refusal reads differently from a mistake", () => {
    expect(explainTwitchError(httpError(400, '{"message":"Nope"}'))).toContain("HTTP 400");
  });

  it("falls back to the first line when the body is not Twitch's JSON", () => {
    expect(explainTwitchError(httpError(500, "<html>gateway</html>"))).toBe(
      "Encountered HTTP status code 500: Forbidden (HTTP 500)",
    );
  });

  it("handles a failure that never reached Twitch", () => {
    expect(explainTwitchError(new Error("fetch failed"))).toBe("fetch failed");
  });

  it("handles something thrown that was not an error", () => {
    expect(explainTwitchError("nope")).toBe("nope");
  });
});

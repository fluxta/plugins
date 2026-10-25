import { describe, expect, it } from "vitest";

import { parseCallback } from "./callback";

const STATE = "0f1e2d3c4b5a69788796a5b4c3d2e1f0";

describe("parseCallback", () => {
  it("reads the token and its lifetime from the fragment", () => {
    expect(
      parseCallback(
        `access_token=abc.def&token_type=Bearer&expires_in=31536000&state=${STATE}`,
        STATE,
      ),
    ).toEqual({ kind: "token", accessToken: "abc.def", expiresIn: 31536000 });
  });

  it("refuses a callback whose state is not this Sign-in's", () => {
    expect(
      parseCallback(
        "access_token=abc&token_type=Bearer&expires_in=60&state=other",
        STATE,
      ),
    ).toEqual({ kind: "state-mismatch" });
    expect(
      parseCallback("access_token=abc&token_type=Bearer&expires_in=60", STATE),
    ).toEqual({ kind: "state-mismatch" });
    expect(parseCallback("", STATE)).toEqual({ kind: "state-mismatch" });
  });

  it("refuses an error that does not carry this Sign-in's state", () => {
    expect(parseCallback("error=access_denied", STATE)).toEqual({
      kind: "state-mismatch",
    });
  });

  it("reports a refusal of access", () => {
    expect(parseCallback(`error=access_denied&state=${STATE}`, STATE)).toEqual({
      kind: "denied",
      reason: "access_denied",
    });
  });

  it("calls a token without a usable lifetime malformed", () => {
    for (const body of [
      `access_token=abc&token_type=Bearer&state=${STATE}`,
      `access_token=abc&token_type=Bearer&expires_in=soon&state=${STATE}`,
      `access_token=abc&token_type=Bearer&expires_in=0&state=${STATE}`,
      `token_type=Bearer&expires_in=60&state=${STATE}`,
      `access_token=abc&token_type=MAC&expires_in=60&state=${STATE}`,
    ]) {
      expect(parseCallback(body, STATE)).toEqual({ kind: "malformed" });
    }
  });
});

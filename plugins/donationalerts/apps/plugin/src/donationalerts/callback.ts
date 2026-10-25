/**
 * What the browser brought back to the loopback redirect.
 *
 * The implicit grant puts its answer in the URL fragment, which never reaches
 * a server; the callback page posts it on, so `body` is the fragment (or, for
 * an error DonationAlerts sends in the query, the query) without its `#`/`?`.
 */
export type CallbackResult =
  | { kind: "token"; accessToken: string; expiresIn: number }
  | { kind: "denied"; reason: string }
  | { kind: "malformed" }
  | { kind: "state-mismatch" };

export function parseCallback(
  body: string,
  expectedState: string,
): CallbackResult {
  const params = new URLSearchParams(body);

  // Checked before anything else: a page that does not know this Sign-in's
  // `state` must not be able to end it, whatever else it sends.
  if (params.get("state") !== expectedState) {
    return { kind: "state-mismatch" };
  }

  const error = params.get("error");

  if (error !== null) {
    return { kind: "denied", reason: error };
  }

  const accessToken = params.get("access_token");
  const tokenType = params.get("token_type");
  const expiresIn = Number(params.get("expires_in"));

  // The expiry is required, not defaulted: the Account's Sign-in Expiry is
  // built on it, and a guessed one would warn on the wrong day.
  if (
    !accessToken ||
    (tokenType !== null && tokenType.toLowerCase() !== "bearer") ||
    !Number.isInteger(expiresIn) ||
    expiresIn <= 0
  ) {
    return { kind: "malformed" };
  }

  return { kind: "token", accessToken, expiresIn };
}

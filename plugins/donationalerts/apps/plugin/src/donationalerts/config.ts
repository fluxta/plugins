/**
 * The registered DonationAlerts application. Sign-in is OAuth's implicit
 * grant, which needs no client secret, so the plugin ships its own public
 * client id and a streamer never registers an application of their own.
 * Never add a secret here.
 */
export const CLIENT_ID = "22320";

/**
 * DonationAlerts accepts only the redirect registered for the application,
 * exactly, so the loopback port is fixed rather than picked at random. It
 * sits below 32768 to stay out of every OS's range of ephemeral ports.
 */
export const LOOPBACK_PORT = 29361;
export const REDIRECT_URI = `http://127.0.0.1:${LOOPBACK_PORT}/callback`;

/** How long a Sign-in waits for the browser before giving up. */
export const SIGN_IN_TIMEOUT_MS = 5 * 60_000;

/**
 * Every scope the plugin uses or is expected to use, requested on one
 * consent screen. DonationAlerts gives no refresh token, so a scope added
 * later would make every streamer sign in again.
 */
export const SCOPES = [
  // The Account's id, name and avatar, and the token the Realtime Connection
  // authenticates with.
  "oauth-user-show",
  // Donation Received, live.
  "oauth-donation-subscribe",
  // Catch-up: the donation list after a reconnect.
  "oauth-donation-index",
  // A Custom Alert Action — not built yet.
  "oauth-custom_alert-store",
  // Goal Updated.
  "oauth-goal-subscribe",
  // Poll Events — not built yet.
  "oauth-poll-subscribe",
];

export const API_BASE_URL = "https://www.donationalerts.com/api/v1";

export function authorizeUrl(state: string): string {
  const url = new URL("https://www.donationalerts.com/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "token",
    scope: SCOPES.join(" "),
    state,
  }).toString();
  return url.toString();
}

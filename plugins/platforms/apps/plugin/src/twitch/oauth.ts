import type { AccessToken } from "@twurple/auth";

import { CLIENT_ID, ID_BASE_URL, scopesFor } from "./config";

import type { AccountRole } from "platforms-protocol";

/**
 * The two id.twitch.tv calls twurple cannot make for us.
 *
 * `@twurple/auth` has no Device Code Flow at all, and its `refreshUserToken`
 * takes the client secret as a required positional argument — which a public
 * client does not have. Everything else about tokens goes through
 * twurple.
 */

/** What Twitch hands back when a device authorization starts. */
export type DeviceAuthorization = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  /** Epoch milliseconds after which the device code stops working. */
  expiresAt: number;
  /** Seconds Twitch asks us to wait between polls. */
  intervalSeconds: number;
};

/**
 * A failure that will not resolve by waiting: the user declined, the code
 * expired, or the refresh token is spent. Callers turn this into
 * "sign in again" rather than retrying.
 */
export class AuthorizationRejected extends Error {}

/** Starts a device authorization and returns what the user must confirm. */
export async function startDeviceAuthorization(
  role: AccountRole,
): Promise<DeviceAuthorization> {
  const response = await post(`${ID_BASE_URL}/oauth2/device`, {
    client_id: CLIENT_ID,
    scopes: scopesFor(role).join(" "),
  });

  if (!response.ok) {
    throw new Error(`Twitch refused the device request: ${await describe(response)}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const deviceCode = asString(payload["device_code"]);
  const userCode = asString(payload["user_code"]);
  const verificationUri = asString(payload["verification_uri"]);
  const expiresIn = asNumber(payload["expires_in"]);
  const interval = asNumber(payload["interval"]);

  if (!deviceCode || !userCode || !verificationUri || expiresIn === undefined) {
    throw new Error("Twitch returned a device response the plugin does not understand");
  }

  return {
    deviceCode,
    userCode,
    verificationUri,
    expiresAt: Date.now() + expiresIn * 1000,
    intervalSeconds: interval ?? 5,
  };
}

/** The outcome of one poll for the token. */
export type PollResult = { state: "pending" } | { state: "granted"; tokens: AccessToken };

/**
 * Polls once for the token.
 *
 * Twitch does not use the OAuth-standard `error` field here — while the user
 * has not confirmed yet it answers HTTP 400 with `{"message":
 * "authorization_pending"}`. Any other 400 is terminal.
 */
export async function pollForToken(
  role: AccountRole,
  deviceCode: string,
): Promise<PollResult> {
  const response = await post(`${ID_BASE_URL}/oauth2/token`, {
    client_id: CLIENT_ID,
    scopes: scopesFor(role).join(" "),
    device_code: deviceCode,
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
  });

  if (response.ok) {
    return { state: "granted", tokens: await readAccessToken(response) };
  }

  const reason = await describe(response);

  if (/authorization_pending/i.test(reason)) {
    return { state: "pending" };
  }

  throw new AuthorizationRejected(reason);
}

/**
 * Exchanges a refresh token for a fresh pair.
 *
 * The refresh token is **single use** — the caller must persist the returned
 * pair before doing anything else with it, or the Account is locked out.
 */
export async function refreshAccessToken(refreshToken: string): Promise<AccessToken> {
  const response = await post(`${ID_BASE_URL}/oauth2/token`, {
    client_id: CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  if (response.ok) {
    return readAccessToken(response);
  }

  // A spent or expired refresh token answers 400 or 401. Either way the only
  // way forward is a new sign-in, so this is never worth retrying.
  throw new AuthorizationRejected(await describe(response));
}

function post(url: string, fields: Record<string, string>): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });
}

async function readAccessToken(response: Response): Promise<AccessToken> {
  const payload = (await response.json()) as Record<string, unknown>;
  const accessToken = asString(payload["access_token"]);
  const refreshToken = asString(payload["refresh_token"]);
  const scope = payload["scope"];

  if (!accessToken || !refreshToken) {
    throw new Error("Twitch returned a token response the plugin does not understand");
  }

  return {
    accessToken,
    refreshToken,
    scope: Array.isArray(scope) ? scope.filter((s): s is string => typeof s === "string") : [],
    expiresIn: asNumber(payload["expires_in"]) ?? null,
    obtainmentTimestamp: Date.now(),
  };
}

/**
 * Turns a failed response into something safe to show and to log. Reads the
 * body as text, so it never surfaces a token from a response we mis-parsed.
 */
async function describe(response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  const message = extractMessage(body);
  return message ? `${message} (HTTP ${response.status})` : `HTTP ${response.status}`;
}

function extractMessage(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    return asString(parsed["message"]) ?? asString(parsed["error"]);
  } catch {
    return body.slice(0, 200) || undefined;
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

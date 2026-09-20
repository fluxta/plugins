import type { AccountRole } from "platforms-protocol";

/**
 * The registered Twitch application. A public client's id is not a secret, and
 * the plugin ships its own so a streamer never has to register an application
 * of their own. The application must be registered with client type
 * **Public**, or the Device Code Flow will demand a client secret.
 */
export const CLIENT_ID = "ubljnjq2nhdfr3suveop6ihxjrt6h6";

/**
 * Every scope a role needs across all of the plugin's features, requested in
 * one consent screen at sign-in.
 *
 * The host matches Events itself and never tells the plugin what is subscribed,
 * so the plugin cannot know which features are actually in use and
 * asks for the lot up front. Asking again later would mean a second consent
 * screen every time a feature ships.
 *
 * A `manage` scope also grants the matching `read`, so only `manage` is listed.
 */
const BROADCASTER_SCOPES = [
  "user:read:chat",
  "user:write:chat",
  // Lets the Bot Account act in this channel's chat.
  "channel:bot",
  "channel:manage:redemptions",
  "channel:manage:polls",
  "channel:manage:predictions",
];

const BOT_SCOPES = ["user:read:chat", "user:write:chat", "user:bot"];

export function scopesFor(role: AccountRole): string[] {
  return role === "broadcaster" ? BROADCASTER_SCOPES : BOT_SCOPES;
}

export const ID_BASE_URL = "https://id.twitch.tv";

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
  // Follow, Subscription, Cheer, Hype Train and Ad Break Begin Events.
  // `channel.raid` needs none of these — it needs no scope at all.
  "moderator:read:followers",
  "channel:read:subscriptions",
  "bits:read",
  "channel:read:hype_train",
  "channel:read:ads",
  // Ban/Timeout/Unban/Untimeout User Actions.
  "moderator:manage:banned_users",
  // Send Shoutout Action, and the Shoutout Received Event — `manage` also
  // grants the `read` that Event's subscription needs.
  "moderator:manage:shoutouts",
  // Update Stream Info Action.
  "channel:manage:broadcast",
  // Start Raid and Cancel Raid Actions.
  "channel:manage:raids",
  // Run Commercial Action.
  "channel:edit:commercial",
  // User Banned, User Timed Out and User Unbanned Events. A scope of its
  // own, distinct from `moderator:manage:banned_users` above: Twitch answers
  // these two Events with an older scope it has not carried over.
  "channel:moderate",
  // Moderator Added/Removed and User Warned Events.
  "moderation:read",
  // VIP Added/Removed Events, and the Add/Remove VIP Actions.
  "channel:manage:vips",
  // Add/Remove Moderator Actions.
  "channel:manage:moderators",
  // Clear Chat and Delete Message Actions.
  "moderator:manage:chat_messages",
  // Warn User Action.
  "moderator:manage:warnings",
  // Send Announcement Action.
  "moderator:manage:announcements",
  // Update Chat Settings Action.
  "moderator:manage:chat_settings",
];

const BOT_SCOPES = ["user:read:chat", "user:write:chat", "user:bot"];

export function scopesFor(role: AccountRole): string[] {
  return role === "broadcaster" ? BROADCASTER_SCOPES : BOT_SCOPES;
}

/**
 * Whether a token's granted scopes still cover everything `scopesFor(role)`
 * currently asks for. A shipped feature can add a scope to that list at any
 * time, and a token granted before that ships will not have it — this is
 * what tells such a token apart from one that is still good.
 */
export function hasRequiredScopes(role: AccountRole, granted: readonly string[]): boolean {
  return scopesFor(role).every((scope) => granted.includes(scope));
}

export const ID_BASE_URL = "https://id.twitch.tv";

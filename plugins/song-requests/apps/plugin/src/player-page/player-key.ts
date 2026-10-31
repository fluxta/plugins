import { randomBytes } from "node:crypto";

import type { PluginSettings } from "../settings";

/**
 * A fresh Player Key: 192 random bits, URL-safe, since it travels in the
 * Player Page's address.
 */
export function newPlayerKey(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * The Player Key: made once, on the first start, and kept in Plugin settings
 * so the address in OBS stays the same, until the streamer replaces it.
 */
export async function ensurePlayerKey(
  settings: PluginSettings,
  save: (settings: PluginSettings) => Promise<void>,
): Promise<string> {
  if (typeof settings.playerKey === "string" && settings.playerKey) {
    return settings.playerKey;
  }

  const playerKey = newPlayerKey();
  // `setPluginSettings` replaces the whole object, so the rest goes with it.
  await save({ ...settings, playerKey });
  return playerKey;
}

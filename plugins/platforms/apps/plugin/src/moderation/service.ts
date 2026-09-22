import { resolveEnablement, type AnnouncementColor, type Enablement } from "platforms-protocol";

import { explainTwitchError } from "../twitch/errors";

import type { ChatSettingsSource, ChatSettingsUpdate, ModerationApi, ModerationTarget } from "./api";

const NO_BROADCASTER = "Connect the broadcaster account to moderate the channel.";

/**
 * What an Update Chat Settings call asks to change. Each mode is
 * independently optional; giving a mode's delay implies turning that mode on
 * with it, since Twitch requires the mode's own boolean in the same request
 * as its delay regardless of whether the boolean is actually changing.
 */
export type ChatSettingsChange = {
  slowMode?: Enablement;
  slowModeDelaySeconds?: number;
  followerOnlyMode?: Enablement;
  followerOnlyModeDelayMinutes?: number;
  subscriberOnlyMode?: Enablement;
  emoteOnlyMode?: Enablement;
  uniqueChatMode?: Enablement;
  nonModeratorChatDelay?: Enablement;
  nonModeratorChatDelaySeconds?: number;
};

/**
 * Bans, times out, unbans, untimes-out, warns, mods/unmods and VIPs/unVIPs a
 * viewer; sends a Shoutout to another channel; deletes one message or clears
 * the Channel's chat outright.
 *
 * Holds no state of its own: every write that names a viewer starts from a
 * login, not an id, so every one of those starts with the same lookup. There
 * is nothing to cache — a login is looked up once per Action run, not kept
 * around to go stale.
 */
export class ModerationService {
  constructor(
    private readonly channelId: () => string | undefined,
    private readonly api: ModerationApi,
  ) {}

  /** Bans a viewer from the Channel outright. */
  async ban(login: string, reason?: string): Promise<void> {
    const target = await this.resolve(login);
    if (!target) return;

    try {
      await this.api.banUser(target.channelId, { user: target.user.id, reason });
      console.log(`Banned "${target.user.displayName}"`);
    } catch (error) {
      console.error(`"${target.user.displayName}" was not banned: ${explainTwitchError(error)}`);
    }
  }

  /** Times a viewer out of the Channel for a limited duration. */
  async timeout(login: string, durationSeconds: number, reason?: string): Promise<void> {
    const target = await this.resolve(login);
    if (!target) return;

    try {
      await this.api.banUser(target.channelId, {
        user: target.user.id,
        duration: durationSeconds,
        reason,
      });
      console.log(`Timed out "${target.user.displayName}" for ${durationSeconds}s`);
    } catch (error) {
      console.error(
        `"${target.user.displayName}" was not timed out: ${explainTwitchError(error)}`,
      );
    }
  }

  /** Lifts a Ban or a Timeout on a viewer — Twitch treats both the same way. */
  async unban(login: string): Promise<void> {
    const target = await this.resolve(login);
    if (!target) return;

    try {
      await this.api.unbanUser(target.channelId, target.user.id);
      console.log(`Unbanned "${target.user.displayName}"`);
    } catch (error) {
      console.error(
        `"${target.user.displayName}" was not unbanned: ${explainTwitchError(error)}`,
      );
    }
  }

  /** Shouts another channel out from the Channel. */
  async shoutout(login: string): Promise<void> {
    const target = await this.resolve(login);
    if (!target) return;

    try {
      await this.api.shoutoutUser(target.channelId, target.user.id);
      console.log(`Shouted out "${target.user.displayName}"`);
    } catch (error) {
      console.error(
        `"${target.user.displayName}" was not shouted out: ${explainTwitchError(error)}`,
      );
    }
  }

  /** Grants a viewer moderator status in the Channel. */
  async addModerator(login: string): Promise<void> {
    const target = await this.resolve(login);
    if (!target) return;

    try {
      await this.api.addModerator(target.channelId, target.user.id);
      console.log(`Made "${target.user.displayName}" a moderator`);
    } catch (error) {
      console.error(
        `"${target.user.displayName}" was not made a moderator: ${explainTwitchError(error)}`,
      );
    }
  }

  /** Revokes a viewer's moderator status in the Channel. */
  async removeModerator(login: string): Promise<void> {
    const target = await this.resolve(login);
    if (!target) return;

    try {
      await this.api.removeModerator(target.channelId, target.user.id);
      console.log(`"${target.user.displayName}" is no longer a moderator`);
    } catch (error) {
      console.error(
        `"${target.user.displayName}" was not removed as a moderator: ${explainTwitchError(error)}`,
      );
    }
  }

  /** Grants a viewer VIP status in the Channel. */
  async addVip(login: string): Promise<void> {
    const target = await this.resolve(login);
    if (!target) return;

    try {
      await this.api.addVip(target.channelId, target.user.id);
      console.log(`Made "${target.user.displayName}" a VIP`);
    } catch (error) {
      console.error(
        `"${target.user.displayName}" was not made a VIP: ${explainTwitchError(error)}`,
      );
    }
  }

  /** Revokes a viewer's VIP status in the Channel. */
  async removeVip(login: string): Promise<void> {
    const target = await this.resolve(login);
    if (!target) return;

    try {
      await this.api.removeVip(target.channelId, target.user.id);
      console.log(`"${target.user.displayName}" is no longer a VIP`);
    } catch (error) {
      console.error(
        `"${target.user.displayName}" was not removed as a VIP: ${explainTwitchError(error)}`,
      );
    }
  }

  /** Deletes every message currently in the Channel's chat. */
  async clearChat(): Promise<void> {
    const channelId = this.channelId();

    if (!channelId) {
      console.error(NO_BROADCASTER);
      return;
    }

    try {
      await this.api.deleteChatMessages(channelId);
      console.log("Cleared the chat");
    } catch (error) {
      console.error(`The chat was not cleared: ${explainTwitchError(error)}`);
    }
  }

  /** Deletes one message from the Channel's chat. */
  async deleteMessage(messageId: string): Promise<void> {
    const channelId = this.channelId();

    if (!channelId) {
      console.error(NO_BROADCASTER);
      return;
    }

    try {
      await this.api.deleteChatMessages(channelId, messageId);
      console.log("Deleted a message");
    } catch (error) {
      console.error(`The message was not deleted: ${explainTwitchError(error)}`);
    }
  }

  /** Warns a viewer, requiring them to acknowledge it before they can chat again. */
  async warnUser(login: string, reason: string): Promise<void> {
    const target = await this.resolve(login);
    if (!target) return;

    try {
      await this.api.warnUser(target.channelId, target.user.id, reason);
      console.log(`Warned "${target.user.displayName}"`);
    } catch (error) {
      console.error(`"${target.user.displayName}" was not warned: ${explainTwitchError(error)}`);
    }
  }

  /** Sends an Announcement to the Channel's chat. */
  async sendAnnouncement(message: string, color?: AnnouncementColor): Promise<void> {
    const channelId = this.channelId();

    if (!channelId) {
      console.error(NO_BROADCASTER);
      return;
    }

    try {
      await this.api.sendAnnouncement(channelId, message, color);
      console.log("Sent an announcement");
    } catch (error) {
      console.error(`The announcement was not sent: ${explainTwitchError(error)}`);
    }
  }

  /** Changes the Channel's chat settings: Slow Mode, Follower-Only Mode and the rest. */
  async updateChatSettings(change: ChatSettingsChange): Promise<void> {
    const channelId = this.channelId();

    if (!channelId) {
      console.error(NO_BROADCASTER);
      return;
    }

    const needsCurrent = [
      change.slowMode,
      change.followerOnlyMode,
      change.subscriberOnlyMode,
      change.emoteOnlyMode,
      change.uniqueChatMode,
      change.nonModeratorChatDelay,
    ].includes("toggle");

    let current: ChatSettingsSource | undefined;

    if (needsCurrent) {
      try {
        current = await this.api.getChatSettings(channelId);
      } catch (error) {
        console.error(`Could not read the channel's chat settings: ${explainTwitchError(error)}`);
        return;
      }
    }

    const data: ChatSettingsUpdate = {};

    applyMode(data, "slowModeEnabled", change.slowMode, current?.slowModeEnabled);
    if (change.slowModeDelaySeconds !== undefined) {
      data.slowModeEnabled = true;
      data.slowModeDelay = change.slowModeDelaySeconds;
    }

    applyMode(data, "followerOnlyModeEnabled", change.followerOnlyMode, current?.followerOnlyModeEnabled);
    if (change.followerOnlyModeDelayMinutes !== undefined) {
      data.followerOnlyModeEnabled = true;
      data.followerOnlyModeDelay = change.followerOnlyModeDelayMinutes;
    }

    applyMode(data, "subscriberOnlyModeEnabled", change.subscriberOnlyMode, current?.subscriberOnlyModeEnabled);
    applyMode(data, "emoteOnlyModeEnabled", change.emoteOnlyMode, current?.emoteOnlyModeEnabled);
    applyMode(data, "uniqueChatModeEnabled", change.uniqueChatMode, current?.uniqueChatModeEnabled);

    applyMode(
      data,
      "nonModeratorChatDelayEnabled",
      change.nonModeratorChatDelay,
      current?.nonModeratorChatDelayEnabled,
    );
    if (change.nonModeratorChatDelaySeconds !== undefined) {
      data.nonModeratorChatDelayEnabled = true;
      data.nonModeratorChatDelay = change.nonModeratorChatDelaySeconds;
    }

    if (Object.keys(data).length === 0) {
      console.warn("Update Chat Settings ran with nothing to change");
      return;
    }

    try {
      await this.api.updateChatSettings(channelId, data);
      console.log("Updated the channel's chat settings");
    } catch (error) {
      console.error(`The channel's chat settings were not updated: ${explainTwitchError(error)}`);
    }
  }

  /** The Channel and the resolved Twitch user a write may act on, or nothing when either is missing. */
  private async resolve(
    login: string,
  ): Promise<{ channelId: string; user: ModerationTarget } | undefined> {
    const channelId = this.channelId();

    if (!channelId) {
      console.error(NO_BROADCASTER);
      return undefined;
    }

    try {
      const user = await this.api.getUserByName(login);

      if (!user) {
        console.error(`No Twitch user is named "${login}"`);
        return undefined;
      }

      return { channelId, user };
    } catch (error) {
      console.error(`Could not look up the Twitch user "${login}": ${explainTwitchError(error)}`);
      return undefined;
    }
  }
}

type ChatSettingsFlag = Exclude<keyof ChatSettingsUpdate, "slowModeDelay" | "followerOnlyModeDelay" | "nonModeratorChatDelay">;

/** Resolves one mode's Enablement against its current state and, if it changed anything, writes it into `data`. */
function applyMode(
  data: ChatSettingsUpdate,
  key: ChatSettingsFlag,
  enablement: Enablement | undefined,
  current: boolean | undefined,
): void {
  const resolved = resolveEnablement(enablement ?? "unchanged", current ?? false);

  if (resolved !== undefined) {
    data[key] = resolved;
  }
}

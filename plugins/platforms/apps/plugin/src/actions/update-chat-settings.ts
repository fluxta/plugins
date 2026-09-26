import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import {
  FOLLOWER_ONLY_MODE_DELAY_MAX,
  FOLLOWER_ONLY_MODE_DELAY_MIN,
  NON_MODERATOR_CHAT_DELAYS,
  SLOW_MODE_DELAY_MAX,
  SLOW_MODE_DELAY_MIN,
  type UpdateChatSettingsSettings,
} from "platforms-protocol";

import type { ChatSettingsChange, ModerationService } from "../moderation/service";

export const UPDATE_CHAT_SETTINGS_ACTION = "twitch-update-chat-settings";

/**
 * Changes the Channel's chat settings: Slow Mode, Follower-Only Mode,
 * Subscriber-Only Mode, Emote-Only Mode, Unique Chat Mode and Non-Moderator
 * Chat Delay.
 *
 * One Action rather than six, because it is one request to Twitch — see
 * Update Reward for the same trade-off. Each mode left as "unchanged" is
 * left alone rather than cleared.
 *
 * Standalone: it acts on the channel, not on the deck Item that triggered it.
 */
export class UpdateChatSettingsAction extends StandaloneAction<UpdateChatSettingsSettings> {
  type = UPDATE_CHAT_SETTINGS_ACTION;

  constructor(private readonly moderation: ModerationService) {
    super();
  }

  onTrigger = async (
    ctx: StandaloneTriggerContext<UpdateChatSettingsSettings>,
  ): Promise<void> => {
    const settings = ctx.settings;

    const change: ChatSettingsChange = {
      slowMode: settings.slowMode,
      followerOnlyMode: settings.followerOnlyMode,
      subscriberOnlyMode: settings.subscriberOnlyMode,
      emoteOnlyMode: settings.emoteOnlyMode,
      uniqueChatMode: settings.uniqueChatMode,
      nonModeratorChatDelay: settings.nonModeratorChatDelay,
    };

    const slowModeDelay = readBoundedDelay(
      "Slow Mode",
      settings.slowModeDelay,
      SLOW_MODE_DELAY_MIN,
      SLOW_MODE_DELAY_MAX,
    );
    if (slowModeDelay !== undefined) {
      change.slowModeDelaySeconds = slowModeDelay;
    }

    const followerOnlyModeDelay = readBoundedDelay(
      "Follower-Only Mode",
      settings.followerOnlyModeDelay,
      FOLLOWER_ONLY_MODE_DELAY_MIN,
      FOLLOWER_ONLY_MODE_DELAY_MAX,
    );
    if (followerOnlyModeDelay !== undefined) {
      change.followerOnlyModeDelayMinutes = followerOnlyModeDelay;
    }

    const nonModeratorChatDelay = readFixedDelay(settings.nonModeratorChatDelaySeconds);
    if (nonModeratorChatDelay !== undefined) {
      change.nonModeratorChatDelaySeconds = nonModeratorChatDelay;
    }

    await this.moderation.updateChatSettings(change);
  };
}

/**
 * A delay the settings ask for, in whatever unit the caller's bounds are in.
 *
 * The field carries a template, so what arrives here is whatever the
 * reference resolved to — a number typed by hand, or something a run
 * variable produced.
 */
function readBoundedDelay(
  mode: string,
  value: string | undefined,
  min: number,
  max: number,
): number | undefined {
  const text = value?.trim();

  if (!text) {
    return undefined;
  }

  const delay = Number(text);

  if (!Number.isInteger(delay) || delay < min || delay > max) {
    console.warn(
      `Update Chat Settings ignored ${mode}'s delay "${text}": Twitch allows between ${min} and ${max}`,
    );
    return undefined;
  }

  return delay;
}

/** Twitch's Non-Moderator Chat Delay accepts only `NON_MODERATOR_CHAT_DELAYS`, not any number of seconds. */
function readFixedDelay(value: string | undefined): number | undefined {
  const text = value?.trim();

  if (!text) {
    return undefined;
  }

  const delay = Number(text);
  const allowed = NON_MODERATOR_CHAT_DELAYS.find((seconds) => seconds === delay);

  if (allowed === undefined) {
    console.warn(
      `Update Chat Settings ignored the Non-Moderator Chat Delay "${text}": Twitch only accepts ` +
        `${NON_MODERATOR_CHAT_DELAYS.join(", ")} seconds`,
    );
    return undefined;
  }

  return allowed;
}

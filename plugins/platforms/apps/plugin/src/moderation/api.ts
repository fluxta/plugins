import type { AnnouncementColor } from "platforms-protocol";

/** What the plugin needs back from a Twitch user lookup. */
export interface ModerationTarget {
  id: string;
  displayName: string;
}

/** What Twitch's Ban User endpoint accepts. Timeout is the same call with a `duration`. */
export interface BanUserData {
  user: string;
  duration?: number;
  reason?: string;
}

/** The Channel's chat settings, as Twitch reports them. */
export interface ChatSettingsSource {
  slowModeEnabled: boolean;
  slowModeDelay: number | null;
  followerOnlyModeEnabled: boolean;
  followerOnlyModeDelay: number | null;
  subscriberOnlyModeEnabled: boolean;
  emoteOnlyModeEnabled: boolean;
  uniqueChatModeEnabled: boolean;
  nonModeratorChatDelayEnabled: boolean;
  nonModeratorChatDelay: number | null;
}

/** What Twitch's Update Chat Settings endpoint accepts. Every field is independently optional. */
export interface ChatSettingsUpdate {
  slowModeEnabled?: boolean;
  slowModeDelay?: number;
  followerOnlyModeEnabled?: boolean;
  followerOnlyModeDelay?: number;
  subscriberOnlyModeEnabled?: boolean;
  emoteOnlyModeEnabled?: boolean;
  uniqueChatModeEnabled?: boolean;
  nonModeratorChatDelayEnabled?: boolean;
  nonModeratorChatDelay?: number;
}

/**
 * The parts of twurple's moderation, channels, chat and user APIs this
 * plugin uses to act on a viewer or another channel.
 *
 * Narrowed to an own type, spanning four of twurple's own namespaces, so
 * everything built on it can be exercised without a live `ApiClient`, which
 * only a connected Account can produce.
 */
export interface ModerationApi {
  /** Twitch has no "act by login" endpoint anywhere here — every write needs the numeric id first. */
  getUserByName(login: string): Promise<ModerationTarget | null>;
  banUser(broadcaster: string, data: BanUserData): Promise<unknown>;
  /** Lifts a Ban or a Timeout — Twitch does not tell the two apart here. */
  unbanUser(broadcaster: string, user: string): Promise<void>;
  shoutoutUser(from: string, to: string): Promise<void>;
  addModerator(broadcaster: string, user: string): Promise<void>;
  removeModerator(broadcaster: string, user: string): Promise<void>;
  addVip(broadcaster: string, user: string): Promise<void>;
  removeVip(broadcaster: string, user: string): Promise<void>;
  /** Deletes one message, or every message when `messageId` is left out. */
  deleteChatMessages(broadcaster: string, messageId?: string): Promise<void>;
  warnUser(broadcaster: string, user: string, reason: string): Promise<unknown>;
  sendAnnouncement(broadcaster: string, message: string, color?: AnnouncementColor): Promise<void>;
  getChatSettings(broadcaster: string): Promise<ChatSettingsSource>;
  updateChatSettings(broadcaster: string, data: ChatSettingsUpdate): Promise<unknown>;
}

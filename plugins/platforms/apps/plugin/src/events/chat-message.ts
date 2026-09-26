/**
 * The Chat Message Event Source.
 *
 * Platform-specific: what a message carries beyond its text
 * differs enough between platforms — Twitch's badges have no YouTube
 * equivalent — that a shared Source would mean fields that stay empty
 * depending on where the message fired. `command-triggered` is the portable
 * layer instead: it normalizes whichever platform's chat fired it into one
 * payload with an explicit `platform` field, so raw chat can stay
 * platform-specific without Commands losing portability.
 */
export const CHAT_MESSAGE_EVENT = "twitch-chat-message";

/** Every field declared for `twitch-chat-message` in the manifest. */
export type ChatMessagePayload = {
  message: string;
  userId: string;
  userLogin: string;
  userName: string;
  messageId: string;
  isBroadcaster: boolean;
  isModerator: boolean;
  isVip: boolean;
  isSubscriber: boolean;
};

/**
 * The parts of twurple's chat message event this mapping reads.
 *
 * Narrowed to an own type so the mapping can be exercised without building a
 * twurple event object, which is only constructible from a live payload.
 */
export type ChatMessageSource = {
  messageId: string;
  messageText: string;
  chatterId: string;
  chatterName: string;
  chatterDisplayName: string;
  /** Chat badges, keyed by badge set id. */
  badges: Record<string, string>;
};

export function toChatMessagePayload(event: ChatMessageSource): ChatMessagePayload {
  const badges = event.badges;

  return {
    message: event.messageText,
    userId: event.chatterId,
    userLogin: event.chatterName,
    userName: event.chatterDisplayName,
    messageId: event.messageId,
    // `channel.chat.message` states standing through badges rather than
    // booleans, so presence of the badge is the whole test.
    isBroadcaster: "broadcaster" in badges,
    isModerator: "moderator" in badges,
    isVip: "vip" in badges,
    // Both are subscriptions; only the source of the sub differs.
    isSubscriber: "subscriber" in badges || "founder" in badges,
  };
}

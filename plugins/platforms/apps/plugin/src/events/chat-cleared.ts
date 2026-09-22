/**
 * The Chat Cleared Event Source.
 *
 * Twitch's `channel.chat.clear` carries nothing beyond which channel it
 * happened in, so there is nothing left to report once the Event has fired.
 */
export const CHAT_CLEARED_EVENT = "twitch-chat-cleared";

/** `twitch-chat-cleared` declares no fields in the manifest — there is nothing to carry. */
export type ChatClearedPayload = Record<string, never>;

export function toChatClearedPayload(): ChatClearedPayload {
  return {};
}

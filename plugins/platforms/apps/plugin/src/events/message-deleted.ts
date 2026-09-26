/**
 * The Message Deleted Event Source.
 *
 * Fires whenever a moderator deletes a single chat message — not when the
 * whole chat is cleared, which fires Chat Cleared instead.
 */
export const MESSAGE_DELETED_EVENT = "twitch-message-deleted";

/** Every field declared for `twitch-message-deleted` in the manifest. */
export type MessageDeletedPayload = {
  messageId: string;
  userId: string;
  userLogin: string;
  userName: string;
};

/**
 * The parts of twurple's message-delete event this mapping reads.
 *
 * Narrowed to an own type so the mapping can be exercised without a live
 * payload, which is the only thing twurple's event can be built from.
 */
export type MessageDeletedSource = {
  messageId: string;
  userId: string;
  userName: string;
  userDisplayName: string;
};

export function toMessageDeletedPayload(event: MessageDeletedSource): MessageDeletedPayload {
  return {
    messageId: event.messageId,
    userId: event.userId,
    userLogin: event.userName,
    userName: event.userDisplayName,
  };
}

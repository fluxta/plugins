/** The Moderator Removed Event Source. */
export const MODERATOR_REMOVED_EVENT = "twitch-moderator-removed";

/** Every field declared for `twitch-moderator-removed` in the manifest. */
export type ModeratorRemovedPayload = {
  userId: string;
  userLogin: string;
  userName: string;
};

/**
 * The parts of twurple's moderator-remove event this mapping reads.
 *
 * Narrowed to an own type so the mapping can be exercised without a live
 * payload, which is the only thing twurple's event can be built from.
 */
export type ModeratorRemovedSource = {
  userId: string;
  userName: string;
  userDisplayName: string;
};

export function toModeratorRemovedPayload(event: ModeratorRemovedSource): ModeratorRemovedPayload {
  return {
    userId: event.userId,
    userLogin: event.userName,
    userName: event.userDisplayName,
  };
}

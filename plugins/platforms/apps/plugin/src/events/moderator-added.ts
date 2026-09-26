/** The Moderator Added Event Source. */
export const MODERATOR_ADDED_EVENT = "twitch-moderator-added";

/** Every field declared for `twitch-moderator-added` in the manifest. */
export type ModeratorAddedPayload = {
  userId: string;
  userLogin: string;
  userName: string;
};

/**
 * The parts of twurple's moderator-add event this mapping reads.
 *
 * Narrowed to an own type so the mapping can be exercised without a live
 * payload, which is the only thing twurple's event can be built from.
 */
export type ModeratorAddedSource = {
  userId: string;
  userName: string;
  userDisplayName: string;
};

export function toModeratorAddedPayload(event: ModeratorAddedSource): ModeratorAddedPayload {
  return {
    userId: event.userId,
    userLogin: event.userName,
    userName: event.userDisplayName,
  };
}

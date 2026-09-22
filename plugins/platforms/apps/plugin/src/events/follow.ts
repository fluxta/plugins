/**
 * The Follow Event Source.
 *
 * Platform-specific, unlike chat: YouTube and Kick have their own follow
 * mechanics, so a shared shape would be mostly guesswork.
 *
 * Twitch requires `moderator:read:followers` even to read a channel's own
 * followers, so the subscription is authorized as the broadcaster being
 * their own moderator.
 */
export const FOLLOW_EVENT = "twitch-follow";

/** Every field declared for `twitch-follow` in the manifest. */
export type FollowPayload = {
  userId: string;
  userLogin: string;
  userName: string;
};

/**
 * The parts of twurple's follow event this mapping reads.
 *
 * Narrowed to an own type so the mapping can be exercised without a live
 * payload, which is the only thing twurple's event can be built from.
 */
export type FollowSource = {
  userId: string;
  userName: string;
  userDisplayName: string;
};

export function toFollowPayload(event: FollowSource): FollowPayload {
  return {
    userId: event.userId,
    userLogin: event.userName,
    userName: event.userDisplayName,
  };
}

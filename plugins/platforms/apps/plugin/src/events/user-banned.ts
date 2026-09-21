/**
 * The User Banned Event Source.
 *
 * Twitch's `channel.ban` subscription type covers both an outright ban and a
 * Timeout; this Source is the permanent leg of it. `user-timed-out.ts` is
 * the other leg, from the same Twitch event.
 */
export const USER_BANNED_EVENT = "twitch-user-banned";

/** Every field declared for `twitch-user-banned` in the manifest. */
export type UserBannedPayload = {
  userId: string;
  userLogin: string;
  userName: string;
  moderatorId: string;
  moderatorLogin: string;
  moderatorName: string;
  reason: string;
};

/**
 * The parts of twurple's ban event this mapping reads.
 *
 * Narrowed to an own type so the mapping can be exercised without a live
 * payload, which is the only thing twurple's event can be built from.
 */
export type UserBannedSource = {
  userId: string;
  userName: string;
  userDisplayName: string;
  moderatorId: string;
  moderatorName: string;
  moderatorDisplayName: string;
  reason: string;
};

export function toUserBannedPayload(event: UserBannedSource): UserBannedPayload {
  return {
    userId: event.userId,
    userLogin: event.userName,
    userName: event.userDisplayName,
    moderatorId: event.moderatorId,
    moderatorLogin: event.moderatorName,
    moderatorName: event.moderatorDisplayName,
    reason: event.reason,
  };
}

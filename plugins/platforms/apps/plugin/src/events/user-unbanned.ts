/**
 * The User Unbanned Event Source.
 *
 * Fires for lifting either a Ban or a Timeout — Twitch's `channel.unban`
 * carries no field that tells the two apart, so neither does this Event.
 */
export const USER_UNBANNED_EVENT = "twitch-user-unbanned";

/** Every field declared for `twitch-user-unbanned` in the manifest. */
export type UserUnbannedPayload = {
  userId: string;
  userLogin: string;
  userName: string;
  moderatorId: string;
  moderatorLogin: string;
  moderatorName: string;
};

/**
 * The parts of twurple's unban event this mapping reads.
 *
 * Narrowed to an own type so the mapping can be exercised without a live
 * payload, which is the only thing twurple's event can be built from.
 */
export type UserUnbannedSource = {
  userId: string;
  userName: string;
  userDisplayName: string;
  moderatorId: string;
  moderatorName: string;
  moderatorDisplayName: string;
};

export function toUserUnbannedPayload(event: UserUnbannedSource): UserUnbannedPayload {
  return {
    userId: event.userId,
    userLogin: event.userName,
    userName: event.userDisplayName,
    moderatorId: event.moderatorId,
    moderatorLogin: event.moderatorName,
    moderatorName: event.moderatorDisplayName,
  };
}

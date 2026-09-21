/**
 * The User Warned Event Source.
 *
 * Fires when a moderator sends a Warning — Warning Acknowledged, for when the
 * viewer clicks through it, is a separate Twitch subscription this Event does
 * not cover.
 */
export const USER_WARNED_EVENT = "twitch-user-warned";

/** Every field declared for `twitch-user-warned` in the manifest. */
export type UserWarnedPayload = {
  userId: string;
  userLogin: string;
  userName: string;
  moderatorId: string;
  moderatorLogin: string;
  moderatorName: string;
  /** Empty when the moderator gave none. */
  reason: string;
};

/**
 * The parts of twurple's warning-send event this mapping reads.
 *
 * Narrowed to an own type so the mapping can be exercised without a live
 * payload, which is the only thing twurple's event can be built from.
 */
export type UserWarnedSource = {
  userId: string;
  userName: string;
  userDisplayName: string;
  moderatorId: string;
  moderatorName: string;
  moderatorDisplayName: string;
  reason: string | null;
};

export function toUserWarnedPayload(event: UserWarnedSource): UserWarnedPayload {
  return {
    userId: event.userId,
    userLogin: event.userName,
    userName: event.userDisplayName,
    moderatorId: event.moderatorId,
    moderatorLogin: event.moderatorName,
    moderatorName: event.moderatorDisplayName,
    reason: event.reason ?? "",
  };
}

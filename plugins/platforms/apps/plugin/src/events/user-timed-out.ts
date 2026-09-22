/**
 * The User Timed Out Event Source.
 *
 * Twitch's `channel.ban` subscription type covers both an outright ban and a
 * Timeout; this Source is the temporary leg of it. `user-banned.ts` is the
 * other leg, from the same Twitch event.
 */
export const USER_TIMED_OUT_EVENT = "twitch-user-timed-out";

/** Every field declared for `twitch-user-timed-out` in the manifest. */
export type UserTimedOutPayload = {
  userId: string;
  userLogin: string;
  userName: string;
  moderatorId: string;
  moderatorLogin: string;
  moderatorName: string;
  reason: string;
  durationSeconds: number;
};

/**
 * The parts of twurple's ban event this mapping reads.
 *
 * Narrowed to an own type so the mapping can be exercised without a live
 * payload, which is the only thing twurple's event can be built from.
 */
export type UserTimedOutSource = {
  userId: string;
  userName: string;
  userDisplayName: string;
  moderatorId: string;
  moderatorName: string;
  moderatorDisplayName: string;
  reason: string;
  startDate: Date;
  /** `null` only for a permanent ban, which never reaches this mapping. */
  endDate: Date | null;
};

export function toUserTimedOutPayload(event: UserTimedOutSource): UserTimedOutPayload {
  return {
    userId: event.userId,
    userLogin: event.userName,
    userName: event.userDisplayName,
    moderatorId: event.moderatorId,
    moderatorLogin: event.moderatorName,
    moderatorName: event.moderatorDisplayName,
    reason: event.reason,
    durationSeconds: durationSeconds(event.startDate, event.endDate),
  };
}

function durationSeconds(start: Date, end: Date | null): number {
  if (!end) {
    return 0;
  }

  return Math.round((end.getTime() - start.getTime()) / 1000);
}

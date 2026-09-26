/**
 * The Resubscription Event Source.
 *
 * Fires when a subscriber's renewal is announced in chat with a message —
 * Twitch calls this the subscription's "message" rather than treating it as
 * another New Subscription, since the viewer is already subscribed.
 */
export const RESUBSCRIPTION_EVENT = "twitch-resubscribe";

/** Every field declared for `twitch-resubscribe` in the manifest. */
export type ResubscriptionPayload = {
  userId: string;
  userLogin: string;
  userName: string;
  /** Twitch's own tier: `1000`, `2000` or `3000`. */
  tier: string;
  cumulativeMonths: number;
  /** 0 when the subscriber chose not to share their streak. */
  streakMonths: number;
  /** How many months this renewal itself covers — more than one for a multi-month purchase. */
  durationMonths: number;
  message: string;
};

/**
 * The parts of twurple's subscription-message event this mapping reads.
 *
 * Narrowed to an own type so the mapping can be exercised without a live
 * payload, which is the only thing twurple's event can be built from.
 */
export type ResubscriptionSource = {
  userId: string;
  userName: string;
  userDisplayName: string;
  tier: string;
  cumulativeMonths: number;
  streakMonths: number | null;
  durationMonths: number;
  messageText: string;
};

export function toResubscriptionPayload(event: ResubscriptionSource): ResubscriptionPayload {
  return {
    userId: event.userId,
    userLogin: event.userName,
    userName: event.userDisplayName,
    tier: event.tier,
    cumulativeMonths: event.cumulativeMonths,
    streakMonths: event.streakMonths ?? 0,
    durationMonths: event.durationMonths,
    message: event.messageText,
  };
}

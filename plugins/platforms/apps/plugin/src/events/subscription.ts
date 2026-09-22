/**
 * The New Subscription Event Source.
 *
 * Fires once, the first month a Subscription starts — including the first
 * month of a gifted one, hence `isGift`. A returning subscriber's later
 * months fire the Resubscription Event instead.
 */
export const SUBSCRIPTION_EVENT = "twitch-subscribe";

/** Every field declared for `twitch-subscribe` in the manifest. */
export type SubscriptionPayload = {
  userId: string;
  userLogin: string;
  userName: string;
  /** Twitch's own tier: `1000`, `2000` or `3000`. */
  tier: string;
  isGift: boolean;
};

/**
 * The parts of twurple's subscription event this mapping reads.
 *
 * Narrowed to an own type so the mapping can be exercised without a live
 * payload, which is the only thing twurple's event can be built from.
 */
export type SubscriptionSource = {
  userId: string;
  userName: string;
  userDisplayName: string;
  tier: string;
  isGift: boolean;
};

export function toSubscriptionPayload(event: SubscriptionSource): SubscriptionPayload {
  return {
    userId: event.userId,
    userLogin: event.userName,
    userName: event.userDisplayName,
    tier: event.tier,
    isGift: event.isGift,
  };
}

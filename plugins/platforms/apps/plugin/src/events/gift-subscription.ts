/**
 * The Gift Subscription Event Source.
 *
 * Fires once per gifting action, not once per recipient: gifting five Subs at
 * once is one Event with `total` set to 5, not five Events. Twitch never
 * names the recipients of a gift batch, so none are reported.
 */
export const GIFT_SUBSCRIPTION_EVENT = "twitch-gift-subscription";

/** Every field declared for `twitch-gift-subscription` in the manifest. */
export type GiftSubscriptionPayload = {
  /** Empty when the gifter chose to stay anonymous. */
  gifterId: string;
  gifterLogin: string;
  gifterName: string;
  /** Twitch's own tier: `1000`, `2000` or `3000`. */
  tier: string;
  /** How many Subs this gift covers. */
  total: number;
  /** The gifter's all-time total; 0 when they gifted anonymously. */
  cumulativeTotal: number;
  isAnonymous: boolean;
};

/**
 * The parts of twurple's subscription-gift event this mapping reads.
 *
 * Narrowed to an own type so the mapping can be exercised without a live
 * payload, which is the only thing twurple's event can be built from.
 */
export type GiftSubscriptionSource = {
  gifterId: string | null;
  gifterName: string | null;
  gifterDisplayName: string | null;
  tier: string;
  amount: number;
  cumulativeAmount: number | null;
  isAnonymous: boolean;
};

export function toGiftSubscriptionPayload(
  event: GiftSubscriptionSource,
): GiftSubscriptionPayload {
  return {
    gifterId: event.gifterId ?? "",
    gifterLogin: event.gifterName ?? "",
    gifterName: event.gifterDisplayName ?? "",
    tier: event.tier,
    total: event.amount,
    cumulativeTotal: event.cumulativeAmount ?? 0,
    isAnonymous: event.isAnonymous,
  };
}

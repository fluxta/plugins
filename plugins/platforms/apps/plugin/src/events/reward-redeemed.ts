/**
 * The Reward Redeemed Event Source.
 *
 * Platform-specific, unlike chat: YouTube and Kick have no channel points, so
 * there is nothing to generalise over and a shared shape would be mostly empty
 * fields.
 */
export const REWARD_REDEEMED_EVENT = "twitch-reward-redeemed";

/** Every field declared for `twitch-reward-redeemed` in the manifest. */
export type RewardRedeemedPayload = {
  /** Identifies this redemption, for fulfilling or refunding it later. */
  redemptionId: string;
  rewardId: string;
  rewardTitle: string;
  rewardCost: number;
  /** What the viewer typed, for a Reward that asks for input. */
  userInput: string;
  status: string;
  userId: string;
  userLogin: string;
  userName: string;
};

/**
 * The parts of twurple's redemption event this mapping reads.
 *
 * Narrowed to an own type so the mapping can be exercised without a live
 * payload, which is the only thing twurple's event can be built from.
 */
export type RewardRedemptionSource = {
  id: string;
  rewardId: string;
  rewardTitle: string;
  rewardCost: number;
  input: string;
  status: string;
  userId: string;
  userName: string;
  userDisplayName: string;
};

export function toRewardRedeemedPayload(
  event: RewardRedemptionSource,
): RewardRedeemedPayload {
  return {
    redemptionId: event.id,
    rewardId: event.rewardId,
    rewardTitle: event.rewardTitle,
    rewardCost: event.rewardCost,
    userInput: event.input,
    status: event.status,
    userId: event.userId,
    userLogin: event.userName,
    userName: event.userDisplayName,
  };
}

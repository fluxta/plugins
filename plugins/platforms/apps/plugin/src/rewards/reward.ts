import type { Reward, RewardDraft } from "platforms-protocol";

/**
 * The parts of twurple's `HelixCustomReward` this mapping reads.
 *
 * Narrowed to an own type so the mapping can be exercised without a live
 * reward, which is the only thing twurple's class can be built from.
 */
export type CustomRewardSource = {
  id: string;
  title: string;
  cost: number;
  prompt: string;
  userInputRequired: boolean;
  isEnabled: boolean;
  isPaused: boolean;
  backgroundColor: string;
  maxRedemptionsPerStream: number | null;
  maxRedemptionsPerUserPerStream: number | null;
  globalCooldown: number | null;
};

/**
 * @param managed Whether this plugin created the Reward. Twitch answers that
 * in a separate request, so it cannot be read off the Reward itself.
 */
export function toReward(source: CustomRewardSource, managed: boolean): Reward {
  return {
    id: source.id,
    title: source.title,
    cost: source.cost,
    prompt: source.prompt,
    userInputRequired: source.userInputRequired,
    enabled: source.isEnabled,
    // Twitch reports a disabled limit as null, and the editor shows zero for
    // "no limit" — the same thing said two ways.
    maxPerStream: source.maxRedemptionsPerStream ?? 0,
    maxPerUserPerStream: source.maxRedemptionsPerUserPerStream ?? 0,
    cooldown: source.globalCooldown ?? 0,
    managed,
    backgroundColor: source.backgroundColor,
    paused: source.isPaused,
  };
}

/** What twurple's create and update calls take, built from a draft. */
export function toRewardData(draft: RewardDraft) {
  return {
    title: draft.title.trim(),
    cost: draft.cost,
    prompt: draft.prompt.trim(),
    isEnabled: draft.enabled,
    userInputRequired: draft.userInputRequired,
    // twurple turns a zero into the "limit disabled" flag Twitch wants, so
    // "no limit" travels as the zero the editor showed.
    maxRedemptionsPerStream: draft.maxPerStream,
    maxRedemptionsPerUserPerStream: draft.maxPerUserPerStream,
    globalCooldown: draft.cooldown,
  };
}

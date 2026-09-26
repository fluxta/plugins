import { z } from "zod";

/**
 * A channel-points Reward, as the sidecar reports it and as the editor edits
 * it.
 *
 * The shape lives here because both sides need it: the sidecar maps Twitch's
 * answer onto it, and the editors list, edit and pick from it. One definition
 * means they cannot drift apart.
 */

/** Twitch's own caps, so the editor can refuse before a round trip. */
export const REWARD_TITLE_MAX = 45;
export const REWARD_PROMPT_MAX = 200;
/** A week, in seconds. */
export const REWARD_COOLDOWN_MAX = 604800;

/**
 * What a Reward is made of, without the parts Twitch assigns.
 *
 * Every limit uses zero for "no limit", the way Twitch's own screens present
 * them — its API spells the same thing as a flag plus a number, which is a
 * detail of the request rather than of the Reward.
 */
export const RewardDraftSchema = z.object({
  title: z.string(),
  /** Channel points a Redemption costs. Twitch's floor is one. */
  cost: z.number(),
  /** What viewers are told when they redeem it. May be empty. */
  prompt: z.string().default(""),
  /** Whether the Reward asks the viewer to type something. */
  userInputRequired: z.boolean().default(false),
  /** Whether viewers can see it. A disabled Reward stays on the channel. */
  enabled: z.boolean().default(true),
  maxPerStream: z.number().default(0),
  maxPerUserPerStream: z.number().default(0),
  /** Seconds before anyone may redeem it again. */
  cooldown: z.number().default(0),
});

export type RewardDraft = z.infer<typeof RewardDraftSchema>;

/** A Reward that exists on the Channel. */
export type Reward = RewardDraft & {
  id: string;
  /**
   * Whether this plugin created it, and may therefore change it, delete it and
   * resolve its Redemptions. Twitch reports it nowhere in the
   * Reward itself — it is the answer to a separate question.
   */
  managed: boolean;
  /** Twitch's hex background, shown so the list reads like the channel's. */
  backgroundColor: string;
  /** Paused Rewards stay visible to viewers but cannot be redeemed. */
  paused: boolean;
};

/** An empty Reward, for the editor to start from. */
export function blankRewardDraft(): RewardDraft {
  return {
    title: "",
    cost: 100,
    prompt: "",
    userInputRequired: false,
    enabled: true,
    maxPerStream: 0,
    maxPerUserPerStream: 0,
    cooldown: 0,
  };
}

/** The editable part of a Reward, for an editor about to change one. */
export function toRewardDraft(reward: Reward): RewardDraft {
  return {
    title: reward.title,
    cost: reward.cost,
    prompt: reward.prompt,
    userInputRequired: reward.userInputRequired,
    enabled: reward.enabled,
    maxPerStream: reward.maxPerStream,
    maxPerUserPerStream: reward.maxPerUserPerStream,
    cooldown: reward.cooldown,
  };
}

/**
 * Why a Reward cannot be saved, or nothing if it can.
 *
 * Twitch is the real authority and refuses the rest on arrival; this only
 * catches what it would refuse in words the streamer cannot act on — a
 * duplicate title comes back as `CREATE_CUSTOM_REWARD_DUPLICATE_REWARD`.
 *
 * @param others Every other Reward on the Channel, the one being edited
 * excluded.
 */
export function validateRewardDraft(
  draft: RewardDraft,
  others: readonly Reward[],
): string | undefined {
  const title = draft.title.trim();

  if (!title) {
    return "Give the reward a title.";
  }

  if (title.length > REWARD_TITLE_MAX) {
    return `A title is at most ${REWARD_TITLE_MAX} characters.`;
  }

  if (draft.prompt.length > REWARD_PROMPT_MAX) {
    return `A description is at most ${REWARD_PROMPT_MAX} characters.`;
  }

  if (!Number.isInteger(draft.cost) || draft.cost < 1) {
    return "A reward costs at least 1 point.";
  }

  if (!isCount(draft.maxPerStream) || !isCount(draft.maxPerUserPerStream)) {
    return "A limit is a whole number of redemptions, or 0 for no limit.";
  }

  if (!isCount(draft.cooldown) || draft.cooldown > REWARD_COOLDOWN_MAX) {
    return "A cooldown is between 0 seconds and a week.";
  }

  // Twitch keeps titles unique per channel, including against Rewards this
  // plugin cannot manage.
  if (others.some((other) => other.title.trim().toLowerCase() === title.toLowerCase())) {
    return `The channel already has a reward called "${title}".`;
  }

  return undefined;
}

function isCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

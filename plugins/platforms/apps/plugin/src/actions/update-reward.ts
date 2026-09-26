import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { UpdateRewardSettings } from "platforms-protocol";

import type { RewardsService } from "../rewards/service";

export const UPDATE_REWARD_ACTION = "twitch-update-reward";

/**
 * Switches a Reward on or off and changes what it costs.
 *
 * One Action rather than three, because it is one request to Twitch and one
 * decision for the author: which Reward, and what about it should be
 * different. Splitting it would put the same Reward picker on three editors.
 *
 * Standalone: it acts on the channel, not on the deck Item that triggered it.
 */
export class UpdateRewardAction extends StandaloneAction<UpdateRewardSettings> {
  type = UPDATE_REWARD_ACTION;

  constructor(private readonly rewards: RewardsService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<UpdateRewardSettings>): Promise<void> => {
    const rewardId = ctx.settings.rewardId?.trim();

    if (!rewardId) {
      console.warn("Update Reward ran with no reward chosen");
      return;
    }

    await this.rewards.change(rewardId, {
      enablement: ctx.settings.enablement ?? "unchanged",
      cost: readCost(ctx.settings.cost),
    });
  };
}

/**
 * The cost the settings ask for, if they ask for one.
 *
 * The field carries a template, so what arrives here is whatever the reference
 * resolved to — a Reward Redeemed cost, a viewer's message, an empty string.
 * Anything that is not a whole positive number is reported and dropped, so the
 * rest of the Action still runs.
 */
function readCost(value: string | undefined): number | undefined {
  const text = value?.trim();

  if (!text) {
    return undefined;
  }

  const cost = Number(text);

  if (!Number.isInteger(cost) || cost < 1) {
    console.warn(`Update Reward ignored the cost "${text}": a cost is a whole number of points`);
    return undefined;
  }

  return cost;
}

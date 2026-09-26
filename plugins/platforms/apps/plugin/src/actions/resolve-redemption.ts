import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { ResolveRedemptionSettings } from "platforms-protocol";

import type { RewardsService } from "../rewards/service";

export const RESOLVE_REDEMPTION_ACTION = "twitch-resolve-redemption";

/**
 * Finishes a Redemption: the viewer got what they paid for, or gets their
 * points back.
 *
 * Both ids are read from the Event that carried the Redemption, which is what
 * closes the loop — a Reward is redeemed, the streamer does the thing, and one
 * press takes it out of Twitch's request queue.
 */
export class ResolveRedemptionAction extends StandaloneAction<ResolveRedemptionSettings> {
  type = RESOLVE_REDEMPTION_ACTION;

  constructor(private readonly rewards: RewardsService) {
    super();
  }

  onTrigger = async (
    ctx: StandaloneTriggerContext<ResolveRedemptionSettings>,
  ): Promise<void> => {
    const rewardId = ctx.settings.rewardId?.trim();
    const redemptionId = ctx.settings.redemptionId?.trim();

    // Empty means the reference resolved to nothing — usually an Action reached
    // from a program the Reward Redeemed event never fired.
    if (!rewardId || !redemptionId) {
      console.warn(
        "Resolve Redemption ran without both ids; it reads them from the Reward Redeemed event",
      );
      return;
    }

    await this.rewards.resolve(rewardId, redemptionId, ctx.settings.resolution ?? "fulfill");
  };
}

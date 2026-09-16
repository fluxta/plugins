import type { HelixCreateCustomRewardData, HelixUpdateCustomRewardData } from "@twurple/api";

import type { CustomRewardSource } from "./reward";

/**
 * The parts of twurple's channel points API the plugin uses.
 *
 * Narrowed to an own type so everything built on it can be exercised without a
 * live `ApiClient`, which only a connected Account can produce. twurple's own
 * Rewards satisfy `CustomRewardSource`, so the real client fits without an
 * adapter.
 */
export interface ChannelPointsApi {
  getCustomRewards(
    broadcaster: string,
    onlyManageable?: boolean,
  ): Promise<CustomRewardSource[]>;

  createCustomReward(
    broadcaster: string,
    data: HelixCreateCustomRewardData,
  ): Promise<CustomRewardSource>;

  updateCustomReward(
    broadcaster: string,
    rewardId: string,
    data: HelixUpdateCustomRewardData,
  ): Promise<CustomRewardSource>;

  deleteCustomReward(broadcaster: string, rewardId: string): Promise<void>;

  updateRedemptionStatusByIds(
    broadcaster: string,
    rewardId: string,
    redemptionIds: string[],
    status: "FULFILLED" | "CANCELED",
  ): Promise<unknown>;
}

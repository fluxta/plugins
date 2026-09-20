import { usePluginData } from "@fluxta/sdk/ui";
import { isPluginMessage, type RewardsState } from "platforms-protocol";

/**
 * The Channel's Rewards, as the sidecar last saw them.
 *
 * An Action editor picks a Reward from this list rather than asking an author
 * to paste an id no screen shows them.
 */
export function useRewards(): RewardsState {
  const { data } = usePluginData<RewardsState>({ event: "get-status" }, (message) =>
    isPluginMessage(message) && message.event === "status" ? message.status.rewards : undefined,
  );

  // Loading, not idle: the list is not empty, it has not arrived yet.
  return data ?? { status: "loading" };
}

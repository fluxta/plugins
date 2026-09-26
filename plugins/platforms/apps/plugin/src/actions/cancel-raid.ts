import { StandaloneAction } from "@fluxta/sdk/api";

import type { ChannelService } from "../channel/service";

export const CANCEL_RAID_ACTION = "twitch-cancel-raid";

/**
 * Cancels a raid the Channel started.
 *
 * Takes no settings: Twitch allows at most one raid initiated by this
 * Channel at a time, so there is nothing to pick.
 *
 * Standalone: it acts on the channel, not on the deck Item that triggered it.
 */
export class CancelRaidAction extends StandaloneAction {
  type = CANCEL_RAID_ACTION;

  constructor(private readonly channel: ChannelService) {
    super();
  }

  onTrigger = async (): Promise<void> => {
    await this.channel.cancelRaid();
  };
}

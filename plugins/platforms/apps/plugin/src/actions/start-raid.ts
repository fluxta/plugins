import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { StartRaidSettings } from "platforms-protocol";

import type { ChannelService } from "../channel/service";

export const START_RAID_ACTION = "twitch-start-raid";

/**
 * Starts a raid from the Channel to another one.
 *
 * Standalone: it acts on the channel, not on the deck Item that triggered it.
 */
export class StartRaidAction extends StandaloneAction<StartRaidSettings> {
  type = START_RAID_ACTION;

  constructor(private readonly channel: ChannelService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<StartRaidSettings>): Promise<void> => {
    const login = ctx.settings.login?.trim();

    if (!login) {
      console.warn("Start Raid ran with no channel chosen");
      return;
    }

    await this.channel.startRaid(login);
  };
}

import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { AddVipSettings } from "platforms-protocol";

import type { ModerationService } from "../moderation/service";

export const ADD_VIP_ACTION = "twitch-add-vip";

/**
 * Grants a viewer VIP status in the Channel.
 *
 * Standalone: it acts on the channel, not on the deck Item that triggered it.
 */
export class AddVipAction extends StandaloneAction<AddVipSettings> {
  type = ADD_VIP_ACTION;

  constructor(private readonly moderation: ModerationService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<AddVipSettings>): Promise<void> => {
    const login = ctx.settings.login?.trim();

    if (!login) {
      console.warn("Add VIP ran with no viewer chosen");
      return;
    }

    await this.moderation.addVip(login);
  };
}

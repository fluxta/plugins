import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { RemoveVipSettings } from "platforms-protocol";

import type { ModerationService } from "../moderation/service";

export const REMOVE_VIP_ACTION = "twitch-remove-vip";

/**
 * Revokes a viewer's VIP status in the Channel.
 *
 * Standalone: it acts on the channel, not on the deck Item that triggered it.
 */
export class RemoveVipAction extends StandaloneAction<RemoveVipSettings> {
  type = REMOVE_VIP_ACTION;

  constructor(private readonly moderation: ModerationService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<RemoveVipSettings>): Promise<void> => {
    const login = ctx.settings.login?.trim();

    if (!login) {
      console.warn("Remove VIP ran with no viewer chosen");
      return;
    }

    await this.moderation.removeVip(login);
  };
}

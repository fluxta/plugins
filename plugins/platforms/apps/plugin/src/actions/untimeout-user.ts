import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { UntimeoutUserSettings } from "platforms-protocol";

import type { ModerationService } from "../moderation/service";

export const UNTIMEOUT_USER_ACTION = "twitch-untimeout-user";

/**
 * Lifts a timeout on a viewer, letting them back into chat early.
 *
 * A separate Action from Unban Twitch User even though Twitch answers both
 * with the same request — see that Action for why.
 *
 * Standalone: it acts on the channel, not on the deck Item that triggered it.
 */
export class UntimeoutUserAction extends StandaloneAction<UntimeoutUserSettings> {
  type = UNTIMEOUT_USER_ACTION;

  constructor(private readonly moderation: ModerationService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<UntimeoutUserSettings>): Promise<void> => {
    const login = ctx.settings.login?.trim();

    if (!login) {
      console.warn("Untimeout User ran with no viewer chosen");
      return;
    }

    await this.moderation.unban(login);
  };
}

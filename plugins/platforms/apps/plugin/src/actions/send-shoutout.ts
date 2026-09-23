import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { SendShoutoutSettings } from "platforms-protocol";

import type { ModerationService } from "../moderation/service";

export const SEND_SHOUTOUT_ACTION = "twitch-send-shoutout";

/**
 * Shouts another channel out from the Channel.
 *
 * Standalone: it acts on the channel, not on the deck Item that triggered it.
 */
export class SendShoutoutAction extends StandaloneAction<SendShoutoutSettings> {
  type = SEND_SHOUTOUT_ACTION;

  constructor(private readonly moderation: ModerationService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<SendShoutoutSettings>): Promise<void> => {
    const login = ctx.settings.login?.trim();

    if (!login) {
      console.warn("Send Shoutout ran with no channel chosen");
      return;
    }

    await this.moderation.shoutout(login);
  };
}

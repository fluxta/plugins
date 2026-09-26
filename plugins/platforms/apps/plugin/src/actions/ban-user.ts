import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { BanUserSettings } from "platforms-protocol";

import type { ModerationService } from "../moderation/service";

export const BAN_USER_ACTION = "twitch-ban-user";

/**
 * Bans a viewer from the Channel outright.
 *
 * A separate Action from Timeout Twitch User even though Twitch answers both
 * with the same request: an author picking "ban" should never be shown a
 * duration field for a ban that has none.
 *
 * Standalone: it acts on the channel, not on the deck Item that triggered it.
 */
export class BanUserAction extends StandaloneAction<BanUserSettings> {
  type = BAN_USER_ACTION;

  constructor(private readonly moderation: ModerationService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<BanUserSettings>): Promise<void> => {
    const login = ctx.settings.login?.trim();

    if (!login) {
      console.warn("Ban User ran with no viewer chosen");
      return;
    }

    await this.moderation.ban(login, ctx.settings.reason?.trim() || undefined);
  };
}

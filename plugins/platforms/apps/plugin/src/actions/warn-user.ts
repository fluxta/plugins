import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { WarnUserSettings } from "platforms-protocol";

import type { ModerationService } from "../moderation/service";

export const WARN_USER_ACTION = "twitch-warn-user";

/**
 * Warns a viewer, requiring them to acknowledge it before they can chat
 * again.
 *
 * Standalone: it acts on the channel, not on the deck Item that triggered it.
 */
export class WarnUserAction extends StandaloneAction<WarnUserSettings> {
  type = WARN_USER_ACTION;

  constructor(private readonly moderation: ModerationService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<WarnUserSettings>): Promise<void> => {
    const login = ctx.settings.login?.trim();

    if (!login) {
      console.warn("Warn User ran with no viewer chosen");
      return;
    }

    const reason = ctx.settings.reason?.trim();

    if (!reason) {
      console.warn("Warn User ran with no reason configured; Twitch requires one");
      return;
    }

    await this.moderation.warnUser(login, reason);
  };
}

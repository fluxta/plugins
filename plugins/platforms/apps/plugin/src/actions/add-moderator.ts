import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { AddModeratorSettings } from "platforms-protocol";

import type { ModerationService } from "../moderation/service";

export const ADD_MODERATOR_ACTION = "twitch-add-moderator";

/**
 * Grants a viewer moderator status in the Channel.
 *
 * Standalone: it acts on the channel, not on the deck Item that triggered it.
 */
export class AddModeratorAction extends StandaloneAction<AddModeratorSettings> {
  type = ADD_MODERATOR_ACTION;

  constructor(private readonly moderation: ModerationService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<AddModeratorSettings>): Promise<void> => {
    const login = ctx.settings.login?.trim();

    if (!login) {
      console.warn("Add Moderator ran with no viewer chosen");
      return;
    }

    await this.moderation.addModerator(login);
  };
}

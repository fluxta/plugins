import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { RemoveModeratorSettings } from "platforms-protocol";

import type { ModerationService } from "../moderation/service";

export const REMOVE_MODERATOR_ACTION = "twitch-remove-moderator";

/**
 * Revokes a viewer's moderator status in the Channel.
 *
 * Standalone: it acts on the channel, not on the deck Item that triggered it.
 */
export class RemoveModeratorAction extends StandaloneAction<RemoveModeratorSettings> {
  type = REMOVE_MODERATOR_ACTION;

  constructor(private readonly moderation: ModerationService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<RemoveModeratorSettings>): Promise<void> => {
    const login = ctx.settings.login?.trim();

    if (!login) {
      console.warn("Remove Moderator ran with no viewer chosen");
      return;
    }

    await this.moderation.removeModerator(login);
  };
}

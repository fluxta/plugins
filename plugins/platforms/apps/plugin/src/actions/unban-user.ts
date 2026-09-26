import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { UnbanUserSettings } from "platforms-protocol";

import type { ModerationService } from "../moderation/service";

export const UNBAN_USER_ACTION = "twitch-unban-user";

/**
 * Lifts a ban on a viewer.
 *
 * A separate Action from Untimeout Twitch User even though Twitch answers
 * both with the same request — an author reaching for "give this viewer
 * their access back" should find the Action named for what they are undoing,
 * not one generic "remove restriction" Action for both.
 *
 * Standalone: it acts on the channel, not on the deck Item that triggered it.
 */
export class UnbanUserAction extends StandaloneAction<UnbanUserSettings> {
  type = UNBAN_USER_ACTION;

  constructor(private readonly moderation: ModerationService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<UnbanUserSettings>): Promise<void> => {
    const login = ctx.settings.login?.trim();

    if (!login) {
      console.warn("Unban User ran with no viewer chosen");
      return;
    }

    await this.moderation.unban(login);
  };
}

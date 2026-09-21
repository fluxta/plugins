import { StandaloneAction } from "@fluxta/sdk/api";

import type { ModerationService } from "../moderation/service";

export const CLEAR_CHAT_ACTION = "twitch-clear-chat";

/**
 * Deletes every message currently in the Channel's chat.
 *
 * Takes no settings: it acts on the whole Channel at once.
 *
 * Standalone: it acts on the channel, not on the deck Item that triggered it.
 */
export class ClearChatAction extends StandaloneAction {
  type = CLEAR_CHAT_ACTION;

  constructor(private readonly moderation: ModerationService) {
    super();
  }

  onTrigger = async (): Promise<void> => {
    await this.moderation.clearChat();
  };
}

import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { DeleteMessageSettings } from "platforms-protocol";

import type { ModerationService } from "../moderation/service";

export const DELETE_MESSAGE_ACTION = "twitch-delete-message";

/**
 * Deletes one message from the Channel's chat.
 *
 * The id is read from whichever Event carried the message — Chat Message or
 * Command Triggered — which is what closes the loop from "a viewer said
 * something" to "that message is gone."
 *
 * Standalone: it acts on the channel, not on the deck Item that triggered it.
 */
export class DeleteMessageAction extends StandaloneAction<DeleteMessageSettings> {
  type = DELETE_MESSAGE_ACTION;

  constructor(private readonly moderation: ModerationService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<DeleteMessageSettings>): Promise<void> => {
    const messageId = ctx.settings.messageId?.trim();

    if (!messageId) {
      console.warn(
        "Delete Message ran with no message id; it reads one from the Chat Message or " +
          "Command Triggered event",
      );
      return;
    }

    await this.moderation.deleteMessage(messageId);
  };
}

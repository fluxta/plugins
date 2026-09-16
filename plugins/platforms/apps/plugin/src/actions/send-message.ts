import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { AccountRole } from "platforms-protocol";

import type { ChatSender } from "../chat/sender";

/** The action's per-instance settings, as its editor saves them. */
export type SendMessageSettings = {
  message?: string;
  /** Which Account speaks. Falls back to the broadcaster. */
  sender?: AccountRole;
  /** The message to reply to, if this should be a threaded reply. */
  replyToMessageId?: string;
};

export const SEND_MESSAGE_ACTION = "send-message";

/**
 * Sends a message to the Channel's chat.
 *
 * Standalone: it acts on the channel, not on the deck Item that triggered it,
 * so it works the same from a button and from an Event.
 *
 * It hands the message to the send queue and returns immediately. Waiting for
 * Twitch would stall every later step of the run behind the chat rate limit,
 * which is a poor trade for a result nothing reads.
 */
export class SendMessageAction extends StandaloneAction<SendMessageSettings> {
  type = SEND_MESSAGE_ACTION;

  constructor(private readonly sender: ChatSender) {
    super();
  }

  onTrigger = (ctx: StandaloneTriggerContext<SendMessageSettings>): void => {
    const message = ctx.settings.message?.trim();

    if (!message) {
      console.warn("Send Chat Message ran with no message configured");
      return;
    }

    const role: AccountRole = ctx.settings.sender ?? "broadcaster";

    this.sender.send(role, {
      message,
      replyToMessageId: ctx.settings.replyToMessageId?.trim() || undefined,
    });
  };
}

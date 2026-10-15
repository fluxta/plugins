import {
  StandaloneAction,
  type StandaloneTriggerContext,
} from "@fluxta/sdk/api";
import type { SendMessageSettings } from "telegram-protocol";

import { resolveChat } from "../chats/resolve";
import type { ChatsStore } from "../chats/store";
import type { CallBotApi } from "../telegram/bot-api";
import { templatedText } from "./templated";

export const SEND_MESSAGE_ACTION = "send-message";

/**
 * Fluxta waits about 30 s for an Action to answer; retries stop early enough
 * that the answer always arrives.
 */
const SEND_DEADLINE_MS = 25_000;

/** The Bot API's `Message`, as much of it as Send Message reads. */
type SentMessage = { message_id: number; text?: string };

/**
 * What a run gets back: `messageId` and `text` once the message is sent, and
 * nothing — the same as producing no values — when it is not.
 */
type Produced = Record<string, number | string>;

/**
 * Posts plain text to a Chat and produces the message's id and its text, so
 * a later step — or, through a Global Variable, a later run — can edit it.
 *
 * Plain text only: the host substitutes Run Variables into the text before
 * it arrives, so the plugin cannot tell a viewer's `<` or `&` from markup
 * the author meant, and a `parse_mode` would let one break the message.
 */
export class SendMessageAction extends StandaloneAction<SendMessageSettings> {
  type = SEND_MESSAGE_ACTION;

  constructor(
    private readonly chats: ChatsStore,
    private readonly api: CallBotApi,
  ) {
    super();
  }

  onTrigger = async (
    ctx: StandaloneTriggerContext<SendMessageSettings>,
  ): Promise<Produced> => {
    const chat = resolveChat(this.chats, ctx.settings.chat);

    if (!chat) {
      console.warn("Send Message ran with no matching Chat configured");
      return {};
    }

    const text = templatedText(ctx.settings.text);

    if (!text?.trim()) {
      console.warn(`Send Message to "${chat.name}" ran with no text`);
      return {};
    }

    try {
      const message = await this.api<SentMessage>(
        chat.token,
        "sendMessage",
        { chat_id: chat.chatId, text },
        { deadlineMs: SEND_DEADLINE_MS },
      );

      return { messageId: message.message_id, text: message.text ?? text };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`Send Message to "${chat.name}" failed: ${reason}`);
      return {};
    }
  };
}

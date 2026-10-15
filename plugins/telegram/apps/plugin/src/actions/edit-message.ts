import {
  StandaloneAction,
  type StandaloneTriggerContext,
} from "@fluxta/sdk/api";
import type { EditMessageSettings } from "telegram-protocol";

import { resolveChat } from "../chats/resolve";
import type { ChatsStore } from "../chats/store";
import { BotApiError, type CallBotApi } from "../telegram/bot-api";
import { templatedNumber, templatedText } from "./templated";

export const EDIT_MESSAGE_ACTION = "edit-message";

/** The same budget as Send Message, inside Fluxta's ~30 s action timeout. */
const EDIT_DEADLINE_MS = 25_000;

/**
 * The id of the Message to edit, or `undefined` when the setting holds none.
 * Telegram numbers a chat's messages from 1, so a blank, a fraction or a 0
 * — what a Global Variable holds before any Message was sent — names no
 * Message, and asking Telegram would only fail.
 */
export function messageIdOf(value: unknown): number | undefined {
  const id = templatedNumber(value);
  return id !== undefined && Number.isInteger(id) && id > 0 ? id : undefined;
}

/**
 * Telegram refuses an edit that would leave the Message as it is. The
 * Message then already says what the run wanted, so that is a success: a
 * run repeated after a retry, or an end-of-stream edit made twice, is not
 * an error.
 */
export function isNotModified(error: unknown): boolean {
  return (
    error instanceof BotApiError &&
    error.code === 400 &&
    /message is not modified/i.test(error.message)
  );
}

/**
 * Replaces the whole text of a Message the Chat's bot posted, as plain text.
 *
 * Whole, because the Bot API cannot read a Message back: to keep part of
 * the old text, the scenario repeats it — for example from Send Message's
 * Message Text kept in a Global Variable. Produces nothing, and never stops
 * the run: a Message that was deleted or an id that is wrong is logged.
 */
export class EditMessageAction extends StandaloneAction<EditMessageSettings> {
  type = EDIT_MESSAGE_ACTION;

  constructor(
    private readonly chats: ChatsStore,
    private readonly api: CallBotApi,
  ) {
    super();
  }

  onTrigger = async (
    ctx: StandaloneTriggerContext<EditMessageSettings>,
  ): Promise<void> => {
    const chat = resolveChat(this.chats, ctx.settings.chat);

    if (!chat) {
      console.warn("Edit Message ran with no matching Chat configured");
      return;
    }

    const messageId = messageIdOf(ctx.settings.messageId);

    if (messageId === undefined) {
      console.warn(
        `Edit Message in "${chat.name}" ran with no message id, so nothing was edited`,
      );
      return;
    }

    const text = templatedText(ctx.settings.text);

    if (!text?.trim()) {
      console.warn(
        `Edit Message ${messageId} in "${chat.name}" ran with no text`,
      );
      return;
    }

    try {
      await this.api(
        chat.token,
        "editMessageText",
        { chat_id: chat.chatId, message_id: messageId, text },
        { deadlineMs: EDIT_DEADLINE_MS },
      );
    } catch (error) {
      if (isNotModified(error)) {
        return;
      }

      const reason = error instanceof Error ? error.message : String(error);
      console.warn(
        `Edit Message ${messageId} in "${chat.name}" failed: ${reason}`,
      );
    }
  };
}

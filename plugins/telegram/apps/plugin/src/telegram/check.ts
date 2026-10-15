import type { ChatStatus } from "telegram-protocol";

import { BotApiError, type CallBotApi } from "./bot-api";

/** Checks are interactive, so they give up sooner than an Action does. */
const CHECK_DEADLINE_MS = 10_000;

/** The Bot API's `User`, as much of it as a check reads. */
type BotUser = { id: number };

/** The Bot API's `Chat` / `ChatFullInfo`, as much of it as a check reads. */
export type TelegramChat = {
  id: number;
  type: string;
  title?: string;
  username?: string;
  first_name?: string;
};

/** The Bot API's `ChatMember` for the bot itself. */
export type BotMembership = {
  status:
    "creator" | "administrator" | "member" | "restricted" | "left" | "kicked";
  can_post_messages?: boolean;
  can_send_messages?: boolean;
};

/**
 * Why the bot may not post in `chat` given its membership there, or
 * `undefined` if it may. In a channel only admins with "Post messages" can
 * post; in a group any member can unless restricted.
 */
export function postingRefusal(
  chat: TelegramChat,
  membership: BotMembership,
): string | undefined {
  switch (membership.status) {
    case "creator":
      return undefined;
    case "administrator":
      return chat.type === "channel" && membership.can_post_messages !== true
        ? "The bot is an admin here but may not post. Turn on “Post messages” in its admin rights."
        : undefined;
    case "member":
      return chat.type === "channel"
        ? "Only admins can post in a channel. Make the bot an admin with “Post messages”."
        : undefined;
    case "restricted":
      return membership.can_send_messages === false
        ? "The bot is restricted from sending messages in this chat."
        : undefined;
    case "left":
    case "kicked":
      return "The bot is not a member of this chat. Add it first.";
  }
}

function titleOf(chat: TelegramChat): string {
  return (
    chat.title ??
    chat.first_name ??
    (chat.username ? `@${chat.username}` : String(chat.id))
  );
}

/**
 * Asks Telegram whether a Chat works: the token belongs to a bot, the bot
 * can see the chat, and it may post there. Never throws — every failure
 * becomes an `error` status whose message tells the user what to fix.
 */
export async function checkChat(
  api: CallBotApi,
  token: string,
  chatId: string,
): Promise<ChatStatus> {
  const options = { deadlineMs: CHECK_DEADLINE_MS };
  let step: "token" | "chat" | "membership" = "token";

  try {
    const bot = await api<BotUser>(token, "getMe", {}, options);

    step = "chat";
    const chat = await api<TelegramChat>(
      token,
      "getChat",
      { chat_id: chatId },
      options,
    );

    // A private chat is a person who started the bot; there is no
    // membership to ask about.
    if (chat.type !== "private") {
      step = "membership";
      const membership = await api<BotMembership>(
        token,
        "getChatMember",
        { chat_id: chatId, user_id: bot.id },
        options,
      );
      const refusal = postingRefusal(chat, membership);

      if (refusal) {
        return { status: "error", message: refusal };
      }
    }

    return { status: "ready", title: titleOf(chat) };
  } catch (error) {
    return { status: "error", message: describeFailure(error, step) };
  }
}

function describeFailure(
  error: unknown,
  step: "token" | "chat" | "membership",
): string {
  if (!(error instanceof BotApiError)) {
    return error instanceof Error ? error.message : String(error);
  }

  if (error.transient) {
    return error.message;
  }

  if (step === "token") {
    return "Telegram rejected the bot token. Copy it again from @BotFather.";
  }

  if (step === "chat") {
    return "The bot cannot see this chat. Add the bot to it — to a channel as an admin — and check the @username or id.";
  }

  return `Telegram would not say whether the bot may post here: ${error.message}`;
}

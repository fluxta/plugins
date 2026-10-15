import { z } from "zod";

export const CHAT_NAME_MAX = 60;

/**
 * What the editor sends to create or change a Chat.
 *
 * `token` means different things depending on which message carries it (see
 * {@link EditorMessage}'s `create-chat` vs `update-chat`): a new Chat needs
 * one; on update, an absent token means "leave the stored one unchanged" —
 * the editor never has the stored token to send back, so there is no other
 * way to say "I didn't touch this field".
 */
export type ChatDraft = {
  name: string;
  chatId: string;
  token?: string;
};

export const ChatDraftSchema = z.object({
  name: z.string(),
  chatId: z.string(),
  token: z.string().optional(),
});

/**
 * One configured Chat as the editor sees it — never the bot token itself,
 * only whether one is stored, so a reopened form shows a placeholder rather
 * than a secret.
 */
export type Chat = {
  id: string;
  name: string;
  /** What the Bot API addresses the chat by: `@username` or a numeric id. */
  chatId: string;
  hasToken: boolean;
};

/**
 * What the plugin last learned about a Chat from Telegram: whether its bot
 * answers and may post there. A Chat is checked when the plugin starts, when
 * the Chat is saved, and when the user asks.
 */
export type ChatStatus =
  | { status: "checking" }
  | { status: "ready"; title: string }
  | { status: "error"; message: string };

export type ChatEntry = Chat & { status: ChatStatus };

const LINK = /^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([A-Za-z0-9_]+)\/?$/i;
// A public username: a letter, then letters, digits or underscores — 4 to 32
// characters in all, the longest Telegram allows.
const USERNAME = /^@[A-Za-z][A-Za-z0-9_]{3,31}$/;
const NUMERIC_ID = /^-?\d+$/;
// A bot token as @BotFather hands it out: the bot's numeric id, a colon, and
// a secret of letters, digits, `-` and `_`.
const TOKEN = /^\d+:[A-Za-z0-9_-]{20,}$/;

/**
 * Reads what a user pasted as the chat — `@name`, a `t.me/name` link, or a
 * numeric id such as `-1001234567890` for a private channel — and returns
 * the form the Bot API's `chat_id` takes, or `undefined` if it is none of
 * those. A private invite link (`t.me/+…`) names no chat the API can use.
 */
export function normalizeChatId(input: string): string | undefined {
  const text = input.trim();
  const link = LINK.exec(text);
  const candidate = link ? `@${link[1]}` : text;

  if (USERNAME.test(candidate) || NUMERIC_ID.test(candidate)) {
    return candidate;
  }

  return undefined;
}

/**
 * Refuses a draft the same way the plugin will, so the editor can catch a
 * problem before round-tripping it.
 *
 * `others` are the configured Chats; `editing` names the Chat being changed,
 * if any, and whether it already has a token stored — that is what lets an
 * edit leave the token field blank.
 */
export function validateChatDraft(
  draft: ChatDraft,
  others: readonly Chat[],
  editing?: { id: string; hasToken: boolean },
): string | undefined {
  const name = draft.name.trim();

  if (!name) {
    return "Give this Chat a name.";
  }

  if (name.length > CHAT_NAME_MAX) {
    return `Chat names are at most ${CHAT_NAME_MAX} characters.`;
  }

  if (others.some((other) => other.id !== editing?.id && other.name === name)) {
    return `Another Chat is already named "${name}".`;
  }

  if (!normalizeChatId(draft.chatId)) {
    return "Enter the channel or group as @username, its t.me link, or its numeric id (a private channel's looks like -1001234567890).";
  }

  if (draft.token === undefined || draft.token.trim() === "") {
    return editing?.hasToken
      ? undefined
      : "Paste the bot token this Chat posts with.";
  }

  if (!TOKEN.test(draft.token.trim())) {
    return "That does not look like a bot token. @BotFather gives one that looks like 123456789:AAH….";
  }

  return undefined;
}

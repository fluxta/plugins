import type { ChatsStore, StoredChat } from "./store";

/**
 * The Chat an Action posts to: the one its settings name, or — when they name
 * none — the sole configured Chat, so settings saved before a second Chat
 * existed keep working.
 */
export function resolveChat(
  store: ChatsStore,
  chatId: string | undefined,
): StoredChat | undefined {
  if (chatId) {
    return store.get(chatId);
  }

  const chats = store.list();
  return chats.length === 1 ? chats[0] : undefined;
}

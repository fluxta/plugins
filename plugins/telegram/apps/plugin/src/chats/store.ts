import { normalizeChatId, type Chat, type ChatDraft } from "telegram-protocol";

/** A Chat as persisted — the only place its bot token is kept. */
export type StoredChat = {
  id: string;
  name: string;
  chatId: string;
  token: string;
};

export type StoredSettings = { chats?: StoredChat[] };

interface SettingsWriter {
  setPluginSettings(data: StoredSettings): Promise<void>;
}

/**
 * The plugin's own view of the persisted Chat list. It is the single writer
 * of Plugin Settings for this plugin, which is what lets `update` merge in a
 * change without ever having to reconstruct a token from what an editor sent
 * it, since the editor never has one to send.
 *
 * `hydrate` is driven by the SDK's `onPluginSettings`, whose first firing
 * (the persisted settings as they were at startup) doubles as this store's
 * load step; there is no separate one.
 *
 * Drafts reaching `create` and `update` have passed `validateChatDraft`.
 */
export class ChatsStore {
  private chats: StoredChat[] = [];

  constructor(private readonly plugin: SettingsWriter) {}

  hydrate(settings: StoredSettings | null | undefined): readonly StoredChat[] {
    this.chats = settings?.chats ?? [];
    return this.chats;
  }

  list(): readonly StoredChat[] {
    return this.chats;
  }

  get(id: string): StoredChat | undefined {
    return this.chats.find((chat) => chat.id === id);
  }

  /** What an editor may see: everything but the token. */
  redacted(): Chat[] {
    return this.chats.map(({ id, name, chatId, token }) => ({
      id,
      name,
      chatId,
      hasToken: Boolean(token),
    }));
  }

  async create(id: string, draft: ChatDraft): Promise<void> {
    this.chats = [
      ...this.chats,
      { id, ...fromDraft(draft), token: draft.token?.trim() ?? "" },
    ];
    await this.persist();
  }

  async update(id: string, draft: ChatDraft): Promise<void> {
    const token = draft.token?.trim();
    this.chats = this.chats.map((existing) =>
      existing.id === id
        ? { ...existing, ...fromDraft(draft), token: token || existing.token }
        : existing,
    );
    await this.persist();
  }

  async remove(id: string): Promise<void> {
    this.chats = this.chats.filter((chat) => chat.id !== id);
    await this.persist();
  }

  private async persist(): Promise<void> {
    await this.plugin.setPluginSettings({ chats: this.chats });
  }
}

function fromDraft(draft: ChatDraft): Pick<StoredChat, "name" | "chatId"> {
  return {
    name: draft.name.trim(),
    chatId: normalizeChatId(draft.chatId) ?? draft.chatId.trim(),
  };
}

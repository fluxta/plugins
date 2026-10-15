import type { ChatStatus } from "telegram-protocol";

import type { CallBotApi } from "../telegram/bot-api";
import { checkChat } from "../telegram/check";
import type { StoredChat } from "./store";

/**
 * What the plugin knows about each Chat's link to Telegram — the Chat Status
 * the Plugin Editor shows and Fluxta's connection indicator reflects.
 *
 * A Chat is checked when it first appears and whenever its chat or token
 * changes; renaming it asks Telegram nothing. Only the newest check of a
 * Chat may set its status, so a slow answer about an old token cannot
 * overwrite one about the new token.
 */
export class ChatsService {
  private readonly statuses = new Map<string, ChatStatus>();
  /** The chat and token each Chat was last checked with. */
  private readonly checkedWith = new Map<string, string>();
  private readonly generations = new Map<string, number>();

  constructor(
    private readonly api: CallBotApi,
    private readonly onChange: () => void,
  ) {}

  statusOf(id: string): ChatStatus | undefined {
    return this.statuses.get(id);
  }

  /**
   * Brings the statuses in line with the configured Chats: forgets removed
   * ones and checks every Chat whose chat or token is new.
   */
  reconcile(chats: readonly StoredChat[]): void {
    const ids = new Set(chats.map((chat) => chat.id));
    let forgot = false;

    for (const id of [...this.generations.keys()]) {
      if (!ids.has(id)) {
        this.statuses.delete(id);
        this.checkedWith.delete(id);
        this.generations.delete(id);
        forgot = true;
      }
    }

    if (forgot) {
      this.onChange();
    }

    for (const chat of chats) {
      if (this.checkedWith.get(chat.id) !== fingerprint(chat)) {
        void this.check(chat);
      }
    }
  }

  /** Checks a Chat now, whatever its last result. */
  async check(chat: StoredChat): Promise<void> {
    const generation = (this.generations.get(chat.id) ?? 0) + 1;
    this.generations.set(chat.id, generation);
    this.checkedWith.set(chat.id, fingerprint(chat));
    this.statuses.set(chat.id, { status: "checking" });
    this.onChange();

    const status = await checkChat(this.api, chat.token, chat.chatId);

    if (this.generations.get(chat.id) !== generation) {
      return;
    }

    this.statuses.set(chat.id, status);
    this.onChange();
  }
}

function fingerprint(chat: StoredChat): string {
  return `${chat.chatId}\n${chat.token}`;
}

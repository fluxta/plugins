import { randomUUID } from "node:crypto";

import {
  isEditorMessage,
  validateChatDraft,
  type ChatEntry,
  type PluginMessage,
} from "telegram-protocol";

import { EditMessageAction } from "./actions/edit-message";
import { SendMessageAction } from "./actions/send-message";
import { ChatsService } from "./chats/service";
import { ChatsStore, type StoredSettings } from "./chats/store";
import { plugin } from "./plugin";
import { createBotApi } from "./telegram/bot-api";

const api = createBotApi();
const store = new ChatsStore(plugin);
const chats = new ChatsService(api, () => publish());

plugin.registerAction(new SendMessageAction(store, api));
plugin.registerAction(new EditMessageAction(store, api));

/**
 * Tells every open editor how the Chats stand, and Fluxta which of them can
 * post — one External Connection per Chat, connected once its check passed.
 */
function publish(): void {
  const entries: ChatEntry[] = store.redacted().map((chat) => ({
    ...chat,
    status: chats.statusOf(chat.id) ?? { status: "checking" },
  }));

  plugin.sendToEditor({
    event: "status",
    status: { chats: entries },
  } satisfies PluginMessage);

  plugin.setConnections(
    entries.map((entry) => ({
      id: entry.id,
      title: entry.name,
      connected: entry.status.status === "ready",
    })),
  );
}

function refuse(message: string): void {
  plugin.sendToEditor({
    event: "chat-refused",
    message,
  } satisfies PluginMessage);
}

function afterWrite(): void {
  chats.reconcile(store.list());
  publish();
}

// Attached before connecting, so nothing sent while the editor was already
// open is missed once the authenticated handshake completes.
plugin.onReceiveFromEditor((message: unknown) => {
  if (!isEditorMessage(message)) {
    return;
  }

  switch (message.event) {
    case "get-status":
      publish();
      return;

    case "create-chat": {
      const refusal = validateChatDraft(message.chat, store.redacted());

      if (refusal) {
        refuse(refusal);
        return;
      }

      void store.create(randomUUID(), message.chat).then(afterWrite);
      return;
    }

    case "update-chat": {
      const existing = store.get(message.id);

      if (!existing) {
        refuse("This Chat no longer exists.");
        return;
      }

      const refusal = validateChatDraft(message.chat, store.redacted(), {
        id: existing.id,
        hasToken: Boolean(existing.token),
      });

      if (refusal) {
        refuse(refusal);
        return;
      }

      void store.update(message.id, message.chat).then(afterWrite);
      return;
    }

    case "delete-chat":
      void store.remove(message.id).then(afterWrite);
      return;

    case "check-chat": {
      const chat = store.get(message.id);

      if (chat) {
        void chats.check(chat);
      }

      return;
    }
  }
});

await plugin.connect();

// Settings are only readable over the authenticated connection, so the first
// firing — which the SDK guarantees fires immediately with what is already
// persisted — waits for it. There is no separate load step: this one firing
// doubles as startup hydration, and every later one is a live change, which
// `reconcile` turns into a check only for a Chat whose chat or token changed.
await plugin.onPluginSettings<StoredSettings>((settings) => {
  chats.reconcile(store.hydrate(settings));
  publish();
});

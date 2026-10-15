import { Button, EmptyState, Section } from "@fluxta/sdk/ui";
import { useState } from "react";
import type { ChatDraft, EditorMessage, PluginStatus } from "telegram-protocol";

import { ChatDialog } from "./ChatDialog";
import { ChatRow } from "./ChatRow";

type Props = {
  chats: PluginStatus["chats"];
  send: (message: EditorMessage) => void;
};

const BLANK_DRAFT: ChatDraft = { name: "", chatId: "" };

export function ChatsCard({ chats, send }: Props) {
  const [adding, setAdding] = useState(false);

  return (
    <Section
      title="Chats"
      description="Each Chat is one Telegram channel, group or person a bot posts to, with the token of that bot. One bot can post to several Chats — give each the same token."
      actions={
        <Button variant="outline" onClick={() => setAdding(true)}>
          Add Chat
        </Button>
      }
    >
      {chats.length === 0 ? (
        <EmptyState>No Chat configured yet.</EmptyState>
      ) : (
        chats.map((chat) => (
          <ChatRow
            key={chat.id}
            chat={chat}
            others={chats.filter((other) => other.id !== chat.id)}
            send={send}
          />
        ))
      )}

      <ChatDialog
        open={adding}
        onOpenChange={setAdding}
        title="Add Chat"
        draft={BLANK_DRAFT}
        others={chats}
        onSave={(draft) => send({ event: "create-chat", chat: draft })}
      />
    </Section>
  );
}

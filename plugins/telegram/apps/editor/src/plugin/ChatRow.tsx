import {
  Button,
  ListRow,
  StatusBadge,
  useConfirm,
  type StatusTone,
} from "@fluxta/sdk/ui";
import { useState } from "react";
import type {
  Chat,
  ChatDraft,
  ChatEntry,
  EditorMessage,
} from "telegram-protocol";

import { ChatDialog } from "./ChatDialog";

type Props = {
  chat: ChatEntry;
  others: readonly Chat[];
  send: (message: EditorMessage) => void;
};

export function ChatRow({ chat, others, send }: Props) {
  const [editing, setEditing] = useState(false);
  const confirm = useConfirm();

  return (
    <>
      <ListRow
        title={chat.name}
        badges={
          <StatusBadge tone={statusTone(chat.status)}>
            {statusLabel(chat.status)}
          </StatusBadge>
        }
        description={
          chat.status.status === "ready"
            ? `${chat.chatId} · ${chat.status.title}`
            : chat.chatId
        }
        detail={
          chat.status.status === "error" ? (
            <p role="alert" className="text-destructive text-xs/relaxed">
              {chat.status.message}
            </p>
          ) : null
        }
        actions={
          <>
            <Button
              variant="outline"
              disabled={chat.status.status === "checking"}
              onClick={() => send({ event: "check-chat", id: chat.id })}
            >
              Check
            </Button>
            <Button variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                const sure = await confirm({
                  title: `Delete "${chat.name}"?`,
                  description:
                    "Every Send Message pointed at this Chat will need a new one.",
                  confirmLabel: "Delete",
                  destructive: true,
                });

                if (sure) {
                  send({ event: "delete-chat", id: chat.id });
                }
              }}
            >
              Delete
            </Button>
          </>
        }
      />
      <ChatDialog
        open={editing}
        onOpenChange={setEditing}
        title="Edit Chat"
        draft={{ name: chat.name, chatId: chat.chatId }}
        editing={{ id: chat.id, hasToken: chat.hasToken }}
        others={others}
        onSave={(draft: ChatDraft) => {
          send({ event: "update-chat", id: chat.id, chat: draft });
        }}
      />
    </>
  );
}

function statusTone(status: ChatEntry["status"]): StatusTone {
  switch (status.status) {
    case "ready":
      return "ok";
    case "checking":
      return "pending";
    case "error":
      return "error";
  }
}

function statusLabel(status: ChatEntry["status"]): string {
  switch (status.status) {
    case "ready":
      return "Ready";
    case "checking":
      return "Checking…";
    case "error":
      return "Cannot post";
  }
}

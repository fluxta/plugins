import { Dialog, TextField } from "@fluxta/sdk/ui";
import { useState } from "react";
import {
  validateChatDraft,
  type Chat,
  type ChatDraft,
} from "telegram-protocol";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  draft: ChatDraft;
  /**
   * The Chat being edited and whether it has a token stored — never the
   * token itself. Absent when adding a Chat.
   */
  editing?: { id: string; hasToken: boolean };
  /** Every other configured Chat, so a clashing name is caught early. */
  others: readonly Chat[];
  onSave: (draft: ChatDraft) => void;
};

export function ChatDialog(props: Props) {
  const { open, onOpenChange, title, draft, editing, others, onSave } = props;

  const [name, setName] = useState(draft.name);
  const [chatId, setChatId] = useState(draft.chatId);
  // Never pre-filled with the stored token — the editor is never sent it.
  // Left blank, an edit keeps the existing one.
  const [token, setToken] = useState("");

  // A reopened dialog reflects the Chat as it stands now, not whatever was
  // last typed into it — reset while rendering the opening, which React
  // prefers over an effect that would render the stale values first.
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);

    if (open) {
      setName(draft.name);
      setChatId(draft.chatId);
      setToken("");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      onSubmit={() => {
        const candidate: ChatDraft = {
          name: name.trim(),
          chatId: chatId.trim(),
          token: token.trim() === "" ? undefined : token.trim(),
        };

        const problem = validateChatDraft(candidate, others, editing);

        if (problem) {
          return problem;
        }

        onSave(candidate);
      }}
    >
      <TextField
        label="Name"
        value={name}
        onChange={setName}
        placeholder="Stream announcements"
        hint="Shown wherever a Send Message picks this Chat."
      />
      <TextField
        label="Chat"
        value={chatId}
        onChange={setChatId}
        placeholder="@my_channel"
        hint="The channel or group as @username or its t.me link. A private one has no username — use its numeric id, which looks like -1001234567890."
      />
      <TextField
        label="Bot token"
        type="password"
        value={token}
        onChange={setToken}
        placeholder={
          editing?.hasToken
            ? "•••• saved — leave blank to keep it"
            : "123456789:AAH…"
        }
        hint="From @BotFather. Add the bot to the chat — to a channel as an admin with “Post messages”."
      />
    </Dialog>
  );
}

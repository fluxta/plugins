import { EditorPage, TemplateField, useActionSettings } from "@fluxta/sdk/ui";
import type { SendMessageSettings } from "telegram-protocol";

import { ChatSelect } from "../shared/ChatSelect";
import { useEditorChats } from "../shared/useEditorChats";

export function SendMessageEditor() {
  const { values, set } = useActionSettings<SendMessageSettings>({ text: "" });
  const chats = useEditorChats();

  return (
    <EditorPage>
      {chats.length === 0 ? (
        <p className="text-muted-foreground text-xs/relaxed">
          No Chat is configured yet. Add one in the Telegram plugin’s settings.
        </p>
      ) : null}
      <ChatSelect chats={chats} value={values.chat} onChange={set("chat")} />
      <TemplateField
        label="Text"
        multiline
        value={values.text ?? ""}
        onChange={set("text")}
        placeholder="🔴 Live now: …"
        hint="Sent as plain text. Later steps can read the message’s id and text — keep the id in a Global Variable to edit the message from another run."
      />
    </EditorPage>
  );
}

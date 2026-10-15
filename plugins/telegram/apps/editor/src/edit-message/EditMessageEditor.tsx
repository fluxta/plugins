import { EditorPage, TemplateField, useActionSettings } from "@fluxta/sdk/ui";
import type { EditMessageSettings } from "telegram-protocol";

import { ChatSelect } from "../shared/ChatSelect";
import { useEditorChats } from "../shared/useEditorChats";

export function EditMessageEditor() {
  const { values, set } = useActionSettings<EditMessageSettings>({
    messageId: "",
    text: "",
  });
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
        label="Message ID"
        value={String(values.messageId ?? "")}
        onChange={set("messageId")}
        placeholder="Send Message’s Message ID"
        hint="The Message ID Send Message produced — from an earlier step, or from the Global Variable you kept it in. Without one, nothing is edited."
      />
      <TemplateField
        label="Text"
        multiline
        value={values.text ?? ""}
        onChange={set("text")}
        placeholder="Stream ended · …"
        hint="Replaces the whole text, as plain text. Telegram cannot tell the plugin what the message says now, so repeat any part you want to keep."
      />
    </EditorPage>
  );
}

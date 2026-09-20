import {
  EditorPage,
  SelectField,
  TemplateField,
  useActionSettings,
  usePluginData,
} from "@fluxta/sdk/ui";
import type { AccountRole, PluginStatus } from "platforms-protocol";

type Settings = {
  message: string;
  sender: AccountRole;
  replyToMessageId: string;
};

export function SendMessageEditor() {
  const { values, set } = useActionSettings<Settings>({
    message: "",
    sender: "broadcaster",
    replyToMessageId: "",
  });

  const { data: status } = usePluginData<PluginStatus>(
    { event: "get-status" },
    "status",
  );
  const botConnected = status?.accounts.bot.status === "connected";

  return (
    <EditorPage>
      <TemplateField
        label="Message"
        value={values.message}
        onChange={set("message")}
        placeholder="What to say in chat"
        multiline
      />

      <SelectField
        label="Send as"
        value={values.sender}
        onChange={(value) => set("sender")(value as AccountRole)}
        options={[
          { value: "broadcaster", label: "Broadcaster" },
          {
            value: "bot",
            label: botConnected ? "Bot" : "Bot — not connected",
            disabled: !botConnected,
          },
        ]}
      />

      <TemplateField
        label="Reply to"
        value={values.replyToMessageId}
        onChange={set("replyToMessageId")}
        placeholder="Optional"
        hint="Insert the message id of what triggered this, to answer it as a reply. Leave empty to post a normal message."
      />
    </EditorPage>
  );
}

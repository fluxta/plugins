import { ActionEditor } from "@fluxta/sdk/api";
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TemplateField,
} from "@fluxta/sdk/ui";
import { useEffect, useRef, useState } from "react";
import {
  isPluginMessage,
  type AccountRole,
  type EditorMessage,
  type PluginStatus,
} from "platforms-protocol";

const editor = new ActionEditor();
const connected = editor.connect();

type Settings = {
  message?: string;
  sender?: AccountRole;
  replyToMessageId?: string;
};

export function SendMessageEditor() {
  const [message, setMessage] = useState("");
  const [sender, setSender] = useState<AccountRole>("broadcaster");
  const [replyToMessageId, setReplyToMessageId] = useState("");
  const [status, setStatus] = useState<PluginStatus>();

  // The save handler is re-registered whenever the form changes, since only
  // one is active at a time and it must return the latest values.
  const latest = useRef<Settings>({});
  latest.current = {
    message,
    sender,
    replyToMessageId: replyToMessageId || undefined,
  };

  useEffect(() => {
    const unsubscribe = editor.onReceiveFromPlugin((incoming: unknown) => {
      if (isPluginMessage(incoming) && incoming.event === "status") {
        setStatus(incoming.status);
      }
    });

    const off = editor.onActionSave(() => latest.current);

    void connected.then(async () => {
      const saved = (await editor.getActionSettings()) as Settings | null;

      if (saved) {
        setMessage(saved.message ?? "");
        setSender(saved.sender ?? "broadcaster");
        setReplyToMessageId(saved.replyToMessageId ?? "");
      }

      editor.sendToPlugin({ event: "get-status" } satisfies EditorMessage);
    });

    return () => {
      unsubscribe();
      off();
    };
  }, []);

  const botConnected = status?.accounts.bot.status === "connected";

  return (
    <main className="min-h-screen space-y-4 p-4 text-foreground">
      <TemplateField
        id="message"
        label="Message"
        value={message}
        onChange={setMessage}
        editor={editor}
        placeholder="What to say in chat"
        multiline
      />

      <div className="space-y-2">
        <Label htmlFor="sender">Send as</Label>
        <Select
          value={sender}
          onValueChange={(value: string) => setSender(value as AccountRole)}
        >
          <SelectTrigger id="sender" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="broadcaster">Broadcaster</SelectItem>
            <SelectItem value="bot" disabled={!botConnected}>
              Bot{botConnected ? "" : " — not connected"}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <TemplateField
        id="reply"
        label="Reply to"
        value={replyToMessageId}
        onChange={setReplyToMessageId}
        editor={editor}
        placeholder="Optional"
        hint="Insert the message id of what triggered this, to answer it as a reply. Leave empty to post a normal message."
      />
    </main>
  );
}

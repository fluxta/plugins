import { ActionEditor } from "@fluxta/sdk/api";
import { Button } from "@fluxta/sdk/ui";
import { useEffect, useState } from "react";

const editor = new ActionEditor();
void editor.connect();

export default function App() {
  const [message, setMessage] = useState("Hello from Fluxta!");

  useEffect(() => editor.onActionSave(() => ({ message })), [message]);

  return (
    <main className="grid min-h-screen place-items-center bg-background p-4 text-foreground">
      <label className="grid w-full max-w-sm gap-2 font-medium">
        Message
        <input
          className="rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
      </label>
      <Button type="button" onClick={() => setMessage("Hello from Fluxta!")}>
        Reset message
      </Button>
    </main>
  );
}

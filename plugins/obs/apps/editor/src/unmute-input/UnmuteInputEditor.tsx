import { ActionEditor } from "@fluxta/sdk/api";
import { useEffect, useRef, useState } from "react";
import type { UnmuteInputSettings } from "obs-protocol";

import { ConnectionSelect } from "../shared/ConnectionSelect";
import { effectiveConnectionId } from "../shared/effectiveConnectionId";
import { PickerSelect } from "../shared/PickerSelect";
import { useEditorConnections } from "../shared/useEditorConnections";
import { useInputs } from "../shared/useLiveLists";

const editor = new ActionEditor();
const connected = editor.connect();

export function UnmuteInputEditor() {
  const [connectionId, setConnectionId] = useState<string>();
  const [input, setInput] = useState<string>();
  const connections = useEditorConnections(editor, connected);
  const inputs = useInputs(editor, connected, effectiveConnectionId(connections, connectionId));

  const latest = useRef<UnmuteInputSettings>({});
  latest.current = { connection: connectionId, input };

  useEffect(() => {
    const off = editor.onActionSave(() => latest.current);

    void connected.then(async () => {
      const saved = (await editor.getActionSettings()) as UnmuteInputSettings | null;
      setConnectionId(saved?.connection);
      setInput(saved?.input);
    });

    return off;
  }, []);

  return (
    <main className="min-h-screen space-y-4 p-4 text-foreground">
      <ConnectionSelect connections={connections} value={connectionId} onChange={setConnectionId} />
      <PickerSelect
        id="input"
        label="Input"
        placeholder="Choose an Input"
        options={inputs}
        value={input}
        onChange={setInput}
      />
    </main>
  );
}

import { ActionEditor } from "@fluxta/sdk/api";

import { ConnectionSelect } from "../shared/ConnectionSelect";
import { useConnectionOnlySettings } from "../shared/useConnectionOnlySettings";
import { useEditorConnections } from "../shared/useEditorConnections";

const editor = new ActionEditor();
const connected = editor.connect();

export function StartStreamEditor() {
  const { connectionId, setConnectionId } = useConnectionOnlySettings(editor, connected);
  const connections = useEditorConnections(editor, connected);

  return (
    <main className="min-h-screen space-y-4 p-4 text-foreground">
      <ConnectionSelect connections={connections} value={connectionId} onChange={setConnectionId} />
      <p className="text-xs text-muted-foreground">Starts the Connection's Stream.</p>
    </main>
  );
}

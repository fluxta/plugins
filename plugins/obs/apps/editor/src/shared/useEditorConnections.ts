import type { BaseEditor } from "@fluxta/sdk/api";
import { useEffect, useState } from "react";
import { isPluginMessage, type ConnectionEntry, type EditorMessage } from "obs-protocol";

/**
 * The configured Connections, as the sidecar last saw them — every Action
 * editor and the plugin-wide editor read this the same way Platforms' Action
 * editors read `useRewards`.
 */
export function useEditorConnections(
  editor: BaseEditor,
  connected: Promise<void>,
): ConnectionEntry[] {
  const [connections, setConnections] = useState<ConnectionEntry[]>([]);

  useEffect(() => {
    const unsubscribe = editor.onReceiveFromPlugin((incoming: unknown) => {
      if (isPluginMessage(incoming) && incoming.event === "status") {
        setConnections(incoming.status.connections);
      }
    });

    void connected.then(() => {
      editor.sendToPlugin({ event: "get-status" } satisfies EditorMessage);
    });

    return unsubscribe;
  }, [editor, connected]);

  return connections;
}

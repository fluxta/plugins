import { ActionEditor } from "@fluxta/sdk/api";
import { useEffect, useRef, useState } from "react";
import type { SetSceneSettings } from "obs-protocol";

import { ConnectionSelect } from "../shared/ConnectionSelect";
import { effectiveConnectionId } from "../shared/effectiveConnectionId";
import { PickerSelect } from "../shared/PickerSelect";
import { useEditorConnections } from "../shared/useEditorConnections";
import { useScenes } from "../shared/useLiveLists";

const editor = new ActionEditor();
const connected = editor.connect();

export function SetSceneEditor() {
  const [connectionId, setConnectionId] = useState<string>();
  const [scene, setScene] = useState<string>();
  const connections = useEditorConnections(editor, connected);
  const scenes = useScenes(editor, connected, effectiveConnectionId(connections, connectionId));

  // Re-captured on every render so the save handler always closes over the
  // latest values, not whatever they were when `onActionSave` first ran.
  const latest = useRef<SetSceneSettings>({});
  latest.current = { connection: connectionId, scene };

  useEffect(() => {
    const off = editor.onActionSave(() => latest.current);

    void connected.then(async () => {
      const saved = (await editor.getActionSettings()) as SetSceneSettings | null;
      setConnectionId(saved?.connection);
      setScene(saved?.scene);
    });

    return off;
  }, []);

  return (
    <main className="min-h-screen space-y-4 p-4 text-foreground">
      <ConnectionSelect connections={connections} value={connectionId} onChange={setConnectionId} />
      <PickerSelect
        id="scene"
        label="Scene"
        placeholder="Choose a Scene"
        options={scenes}
        value={scene}
        onChange={setScene}
      />
    </main>
  );
}

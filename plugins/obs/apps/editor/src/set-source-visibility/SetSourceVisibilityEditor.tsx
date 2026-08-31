import { ActionEditor } from "@fluxta/sdk/api";
import { useEffect, useRef, useState } from "react";
import type { SetSourceVisibilitySettings, VisibilityMode } from "obs-protocol";

import { ConnectionSelect } from "../shared/ConnectionSelect";
import { effectiveConnectionId } from "../shared/effectiveConnectionId";
import { ModeSelect } from "../shared/ModeSelect";
import { PickerSelect } from "../shared/PickerSelect";
import { useEditorConnections } from "../shared/useEditorConnections";
import { useScenes, useSceneSources } from "../shared/useLiveLists";

const editor = new ActionEditor();
const connected = editor.connect();

const MODE_OPTIONS: readonly { value: VisibilityMode; label: string }[] = [
  { value: "show", label: "Show" },
  { value: "hide", label: "Hide" },
  { value: "toggle", label: "Toggle" },
];

export function SetSourceVisibilityEditor() {
  const [connectionId, setConnectionId] = useState<string>();
  const [scene, setScene] = useState<string>();
  const [source, setSource] = useState<string>();
  const [mode, setMode] = useState<VisibilityMode>();
  const connections = useEditorConnections(editor, connected);
  const activeConnectionId = effectiveConnectionId(connections, connectionId);
  const scenes = useScenes(editor, connected, activeConnectionId);
  const sources = useSceneSources(editor, connected, activeConnectionId, scene);

  const latest = useRef<SetSourceVisibilitySettings>({});
  latest.current = { connection: connectionId, scene, source, mode };

  useEffect(() => {
    const off = editor.onActionSave(() => latest.current);

    void connected.then(async () => {
      const saved = (await editor.getActionSettings()) as SetSourceVisibilitySettings | null;
      setConnectionId(saved?.connection);
      setScene(saved?.scene);
      setSource(saved?.source);
      setMode(saved?.mode);
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
        onChange={(next) => {
          setScene(next);
          // A Source picked against the previous Scene has no reason to
          // still be right against a new one.
          setSource(undefined);
        }}
      />
      <PickerSelect
        id="source"
        label="Source"
        placeholder={scene ? "Choose a Source" : "Choose a Scene first"}
        options={sources}
        value={source}
        onChange={setSource}
      />
      <ModeSelect value={mode} options={MODE_OPTIONS} onChange={setMode} />
    </main>
  );
}

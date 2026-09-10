import { ActionEditor } from "@fluxta/sdk/api";
import { useEffect, useRef, useState } from "react";
import type { FilterMode, SetSourceFilterSettings } from "obs-protocol";

import { ConnectionSelect } from "../shared/ConnectionSelect";
import { effectiveConnectionId } from "../shared/effectiveConnectionId";
import { ModeSelect } from "../shared/ModeSelect";
import { PickerSelect } from "../shared/PickerSelect";
import { useEditorConnections } from "../shared/useEditorConnections";
import { useFilters, useSceneSources, useScenes } from "../shared/useLiveLists";

const editor = new ActionEditor();
const connected = editor.connect();

const MODE_OPTIONS: readonly { value: FilterMode; label: string }[] = [
  { value: "enable", label: "Enable" },
  { value: "disable", label: "Disable" },
  { value: "toggle", label: "Toggle" },
];

export function SetSourceFilterEditor() {
  const [connectionId, setConnectionId] = useState<string>();
  const [scene, setScene] = useState<string>();
  const [source, setSource] = useState<string>();
  const [filter, setFilter] = useState<string>();
  const [mode, setMode] = useState<FilterMode>();
  const connections = useEditorConnections(editor, connected);
  const activeConnectionId = effectiveConnectionId(connections, connectionId);
  const scenes = useScenes(editor, connected, activeConnectionId);
  // A Filter belongs to the Source itself, not to any Scene — `scene` only
  // narrows this picker, it is never read by the Action (see the settings
  // type's own doc comment).
  const sources = useSceneSources(editor, connected, activeConnectionId, scene);
  const filters = useFilters(editor, connected, activeConnectionId, source);

  const latest = useRef<SetSourceFilterSettings>({});
  latest.current = { connection: connectionId, scene, source, filter, mode };

  useEffect(() => {
    const off = editor.onActionSave(() => latest.current);

    void connected.then(async () => {
      const saved = (await editor.getActionSettings()) as SetSourceFilterSettings | null;
      setConnectionId(saved?.connection);
      setScene(saved?.scene);
      setSource(saved?.source);
      setFilter(saved?.filter);
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
          setFilter(undefined);
        }}
      />
      <PickerSelect
        id="source"
        label="Source"
        placeholder={scene ? "Choose a Source" : "Choose a Scene first"}
        options={sources}
        value={source}
        onChange={(next) => {
          setSource(next);
          // A Filter picked against the previous Source has no reason to
          // still exist on a different one.
          setFilter(undefined);
        }}
      />
      <PickerSelect
        id="filter"
        label="Filter"
        placeholder={source ? "Choose a Filter" : "Choose a Source first"}
        options={filters}
        value={filter}
        onChange={setFilter}
      />
      <ModeSelect value={mode} options={MODE_OPTIONS} onChange={setMode} />
    </main>
  );
}

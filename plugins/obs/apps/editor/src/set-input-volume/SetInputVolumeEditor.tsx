import { ActionEditor } from "@fluxta/sdk/api";
import { Input, Label } from "@fluxta/sdk/ui";
import { useEffect, useRef, useState } from "react";
import type { SetInputVolumeSettings } from "obs-protocol";

import { ConnectionSelect } from "../shared/ConnectionSelect";
import { effectiveConnectionId } from "../shared/effectiveConnectionId";
import { PickerSelect } from "../shared/PickerSelect";
import { useEditorConnections } from "../shared/useEditorConnections";
import { useInputs } from "../shared/useLiveLists";

const editor = new ActionEditor();
const connected = editor.connect();

export function SetInputVolumeEditor() {
  const [connectionId, setConnectionId] = useState<string>();
  const [input, setInput] = useState<string>();
  const [volumePercent, setVolumePercent] = useState("");
  const connections = useEditorConnections(editor, connected);
  const inputs = useInputs(editor, connected, effectiveConnectionId(connections, connectionId));

  const latest = useRef<SetInputVolumeSettings>({});
  latest.current = {
    connection: connectionId,
    input,
    volumePercent: volumePercent === "" ? undefined : Number(volumePercent),
  };

  useEffect(() => {
    const off = editor.onActionSave(() => latest.current);

    void connected.then(async () => {
      const saved = (await editor.getActionSettings()) as SetInputVolumeSettings | null;
      setConnectionId(saved?.connection);
      setInput(saved?.input);
      setVolumePercent(saved?.volumePercent === undefined ? "" : String(saved.volumePercent));
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
      <div className="space-y-2">
        <Label htmlFor="volume">Volume</Label>
        <Input
          id="volume"
          type="number"
          min={0}
          value={volumePercent}
          onChange={(event) => setVolumePercent(event.target.value)}
          placeholder="100"
        />
        <p className="text-xs text-muted-foreground">
          Percent — matches what OBS's own mixer shows. 100 is unity gain; OBS allows boosting past
          it.
        </p>
      </div>
    </main>
  );
}

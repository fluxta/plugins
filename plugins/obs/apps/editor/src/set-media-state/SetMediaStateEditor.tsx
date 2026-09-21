import { EditorPage, useActionSettings } from "@fluxta/sdk/ui";
import type { MediaMode, SetMediaStateSettings } from "obs-protocol";

import { ConnectionSelect } from "../shared/ConnectionSelect";
import { effectiveConnectionId } from "../shared/effectiveConnectionId";
import { ModeSelect } from "../shared/ModeSelect";
import { PickerSelect } from "../shared/PickerSelect";
import { useEditorConnections } from "../shared/useEditorConnections";
import { useInputs } from "../shared/useLiveLists";

// Both kinds respond to OBS's transport controls (play/pause/stop/etc) —
// VLC Video Source just can't have its file swapped by this plugin's Set
// Media/Image Source File (its "file" is a whole playlist, not one path).
const MEDIA_INPUT_KINDS = ["ffmpeg_source", "vlc_source"];

const MODE_OPTIONS: readonly { value: MediaMode; label: string }[] = [
  { value: "play", label: "Play" },
  { value: "pause", label: "Pause" },
  { value: "stop", label: "Stop" },
  { value: "restart", label: "Restart" },
  { value: "next", label: "Next" },
  { value: "previous", label: "Previous" },
];

export function SetMediaStateEditor() {
  const { values, set } = useActionSettings<SetMediaStateSettings>();
  const connections = useEditorConnections();
  const inputs = useInputs(
    effectiveConnectionId(connections, values.connection),
    MEDIA_INPUT_KINDS,
  );

  return (
    <EditorPage>
      <ConnectionSelect connections={connections} value={values.connection} onChange={set("connection")} />
      <PickerSelect
        label="Media Source"
        placeholder="Choose an Input"
        options={inputs}
        value={values.input}
        onChange={set("input")}
      />
      <ModeSelect value={values.mode} options={MODE_OPTIONS} onChange={set("mode")} />
    </EditorPage>
  );
}

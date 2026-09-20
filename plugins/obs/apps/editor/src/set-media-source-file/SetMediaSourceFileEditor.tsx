import { EditorPage, TextField, useActionSettings } from "@fluxta/sdk/ui";
import type { SetMediaSourceFileSettings } from "obs-protocol";

import { ConnectionSelect } from "../shared/ConnectionSelect";
import { effectiveConnectionId } from "../shared/effectiveConnectionId";
import { PickerSelect } from "../shared/PickerSelect";
import { useEditorConnections } from "../shared/useEditorConnections";
import { useInputs } from "../shared/useLiveLists";

// Must match `FILE_SETTINGS_KEY` in the plugin's `obs/media.ts` exactly —
// those are the only two kinds this Action knows how to set a file on.
const MEDIA_FILE_INPUT_KINDS = ["ffmpeg_source", "image_source"];

export function SetMediaSourceFileEditor() {
  const { values, set } = useActionSettings<SetMediaSourceFileSettings>({ path: "" });
  const connections = useEditorConnections();
  const inputs = useInputs(
    effectiveConnectionId(connections, values.connection),
    MEDIA_FILE_INPUT_KINDS,
  );

  return (
    <EditorPage>
      <ConnectionSelect connections={connections} value={values.connection} onChange={set("connection")} />
      <PickerSelect
        label="Media/Image Source"
        placeholder="Choose an Input"
        options={inputs}
        value={values.input}
        onChange={set("input")}
      />
      <TextField
        label="File Path"
        value={values.path ?? ""}
        onChange={set("path")}
        placeholder="C:\Users\you\Videos\clip.mp4"
        hint="Works on Media Sources and Image Sources — any other Input kind is refused."
      />
    </EditorPage>
  );
}

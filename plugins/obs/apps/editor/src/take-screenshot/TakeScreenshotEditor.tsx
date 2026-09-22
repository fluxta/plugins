import { EditorPage, TextField, useActionSettings } from "@fluxta/sdk/ui";
import type { TakeScreenshotSettings } from "obs-protocol";

import { ConnectionSelect } from "../shared/ConnectionSelect";
import { effectiveConnectionId } from "../shared/effectiveConnectionId";
import { PickerSelect } from "../shared/PickerSelect";
import { useEditorConnections } from "../shared/useEditorConnections";
import { useInputs } from "../shared/useLiveLists";

export function TakeScreenshotEditor() {
  const { values, set } = useActionSettings<TakeScreenshotSettings>({ path: "" });
  const connections = useEditorConnections();
  const inputs = useInputs(effectiveConnectionId(connections, values.connection));

  return (
    <EditorPage>
      <ConnectionSelect connections={connections} value={values.connection} onChange={set("connection")} />
      <PickerSelect
        label="Source"
        placeholder="Choose a Source"
        options={inputs}
        value={values.source}
        onChange={set("source")}
      />
      <TextField
        label="File Path"
        value={values.path ?? ""}
        onChange={set("path")}
        placeholder="C:\Users\you\Pictures\screenshot.png"
        hint="Full path, filename and extension included — the image format is taken from the extension (.png, .jpg/.jpeg, or .bmp). A repeat trigger with the same path overwrites the previous screenshot."
      />
    </EditorPage>
  );
}

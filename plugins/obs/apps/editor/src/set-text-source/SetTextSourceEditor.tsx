import { EditorPage, TextField, useActionSettings } from "@fluxta/sdk/ui";
import type { SetTextSourceSettings } from "obs-protocol";

import { ConnectionSelect } from "../shared/ConnectionSelect";
import { effectiveConnectionId } from "../shared/effectiveConnectionId";
import { PickerSelect } from "../shared/PickerSelect";
import { useEditorConnections } from "../shared/useEditorConnections";
import { useInputs } from "../shared/useLiveLists";

// Covers both OBS's current Text Source kinds (Windows GDI+, Mac/Linux
// FreeType 2) and their pre-v2 predecessors, so an older scene collection's
// Text Sources still show up.
const TEXT_INPUT_KINDS = [
  "text_gdiplus_v2",
  "text_gdiplus",
  "text_ft2_source_v2",
  "text_ft2_source",
];

export function SetTextSourceEditor() {
  const { values, set } = useActionSettings<SetTextSourceSettings>({ text: "" });
  const connections = useEditorConnections();
  const inputs = useInputs(
    effectiveConnectionId(connections, values.connection),
    TEXT_INPUT_KINDS,
  );

  return (
    <EditorPage>
      <ConnectionSelect connections={connections} value={values.connection} onChange={set("connection")} />
      <PickerSelect
        label="Text Source"
        placeholder="Choose an Input"
        options={inputs}
        value={values.input}
        onChange={set("input")}
      />
      <TextField
        label="Text"
        multiline
        value={values.text ?? ""}
        onChange={set("text")}
        placeholder="New text to display"
      />
    </EditorPage>
  );
}

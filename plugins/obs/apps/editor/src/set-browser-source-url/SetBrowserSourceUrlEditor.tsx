import { EditorPage, TextField, useActionSettings } from "@fluxta/sdk/ui";
import type { SetBrowserSourceUrlSettings } from "obs-protocol";

import { ConnectionSelect } from "../shared/ConnectionSelect";
import { effectiveConnectionId } from "../shared/effectiveConnectionId";
import { PickerSelect } from "../shared/PickerSelect";
import { useEditorConnections } from "../shared/useEditorConnections";
import { useInputs } from "../shared/useLiveLists";

const BROWSER_INPUT_KINDS = ["browser_source"];

export function SetBrowserSourceUrlEditor() {
  const { values, set } = useActionSettings<SetBrowserSourceUrlSettings>({ url: "" });
  const connections = useEditorConnections();
  const inputs = useInputs(
    effectiveConnectionId(connections, values.connection),
    BROWSER_INPUT_KINDS,
  );

  return (
    <EditorPage>
      <ConnectionSelect connections={connections} value={values.connection} onChange={set("connection")} />
      <PickerSelect
        label="Browser Source"
        placeholder="Choose an Input"
        options={inputs}
        value={values.input}
        onChange={set("input")}
      />
      <TextField
        label="URL"
        type="url"
        value={values.url ?? ""}
        onChange={set("url")}
        placeholder="https://example.com/overlay"
      />
    </EditorPage>
  );
}

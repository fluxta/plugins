import { EditorPage, useActionSettings } from "@fluxta/sdk/ui";
import type { MuteInputSettings } from "obs-protocol";

import { ConnectionSelect } from "../shared/ConnectionSelect";
import { effectiveConnectionId } from "../shared/effectiveConnectionId";
import { PickerSelect } from "../shared/PickerSelect";
import { useEditorConnections } from "../shared/useEditorConnections";
import { useInputs } from "../shared/useLiveLists";

export function MuteInputEditor() {
  const { values, set } = useActionSettings<MuteInputSettings>();
  const connections = useEditorConnections();
  const inputs = useInputs(effectiveConnectionId(connections, values.connection));

  return (
    <EditorPage>
      <ConnectionSelect connections={connections} value={values.connection} onChange={set("connection")} />
      <PickerSelect
        label="Input"
        placeholder="Choose an Input"
        options={inputs}
        value={values.input}
        onChange={set("input")}
      />
    </EditorPage>
  );
}

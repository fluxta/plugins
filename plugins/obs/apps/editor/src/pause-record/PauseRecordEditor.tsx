import { EditorPage, useActionSettings } from "@fluxta/sdk/ui";
import type { PauseRecordSettings } from "obs-protocol";

import { ConnectionSelect } from "../shared/ConnectionSelect";
import { useEditorConnections } from "../shared/useEditorConnections";

export function PauseRecordEditor() {
  const { values, set } = useActionSettings<PauseRecordSettings>();
  const connections = useEditorConnections();

  return (
    <EditorPage>
      <ConnectionSelect connections={connections} value={values.connection} onChange={set("connection")} />
      <p className="text-muted-foreground text-xs/relaxed">
        Pauses the Connection's Recording without stopping it.
      </p>
    </EditorPage>
  );
}

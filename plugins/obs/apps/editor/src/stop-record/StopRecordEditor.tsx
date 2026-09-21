import { EditorPage, useActionSettings } from "@fluxta/sdk/ui";
import type { StopRecordSettings } from "obs-protocol";

import { ConnectionSelect } from "../shared/ConnectionSelect";
import { useEditorConnections } from "../shared/useEditorConnections";

export function StopRecordEditor() {
  const { values, set } = useActionSettings<StopRecordSettings>();
  const connections = useEditorConnections();

  return (
    <EditorPage>
      <ConnectionSelect connections={connections} value={values.connection} onChange={set("connection")} />
      <p className="text-muted-foreground text-xs/relaxed">Stops the Connection's Recording.</p>
    </EditorPage>
  );
}

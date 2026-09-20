import { EditorPage, useActionSettings } from "@fluxta/sdk/ui";
import type { StartRecordSettings } from "obs-protocol";

import { ConnectionSelect } from "../shared/ConnectionSelect";
import { useEditorConnections } from "../shared/useEditorConnections";

export function StartRecordEditor() {
  const { values, set } = useActionSettings<StartRecordSettings>();
  const connections = useEditorConnections();

  return (
    <EditorPage>
      <ConnectionSelect connections={connections} value={values.connection} onChange={set("connection")} />
      <p className="text-muted-foreground text-xs/relaxed">Starts the Connection's Recording.</p>
    </EditorPage>
  );
}

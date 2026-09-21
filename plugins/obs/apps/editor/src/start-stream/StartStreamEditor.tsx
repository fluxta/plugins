import { EditorPage, useActionSettings } from "@fluxta/sdk/ui";
import type { StartStreamSettings } from "obs-protocol";

import { ConnectionSelect } from "../shared/ConnectionSelect";
import { useEditorConnections } from "../shared/useEditorConnections";

export function StartStreamEditor() {
  const { values, set } = useActionSettings<StartStreamSettings>();
  const connections = useEditorConnections();

  return (
    <EditorPage>
      <ConnectionSelect connections={connections} value={values.connection} onChange={set("connection")} />
      <p className="text-muted-foreground text-xs/relaxed">Starts the Connection's Stream.</p>
    </EditorPage>
  );
}

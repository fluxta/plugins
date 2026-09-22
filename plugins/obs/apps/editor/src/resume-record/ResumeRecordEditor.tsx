import { EditorPage, useActionSettings } from "@fluxta/sdk/ui";
import type { ResumeRecordSettings } from "obs-protocol";

import { ConnectionSelect } from "../shared/ConnectionSelect";
import { useEditorConnections } from "../shared/useEditorConnections";

export function ResumeRecordEditor() {
  const { values, set } = useActionSettings<ResumeRecordSettings>();
  const connections = useEditorConnections();

  return (
    <EditorPage>
      <ConnectionSelect connections={connections} value={values.connection} onChange={set("connection")} />
      <p className="text-muted-foreground text-xs/relaxed">Resumes the Connection's paused Recording.</p>
    </EditorPage>
  );
}

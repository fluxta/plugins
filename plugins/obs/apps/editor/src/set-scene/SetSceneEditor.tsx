import { EditorPage, useActionSettings } from "@fluxta/sdk/ui";
import type { SetSceneSettings } from "obs-protocol";

import { ConnectionSelect } from "../shared/ConnectionSelect";
import { effectiveConnectionId } from "../shared/effectiveConnectionId";
import { PickerSelect } from "../shared/PickerSelect";
import { useEditorConnections } from "../shared/useEditorConnections";
import { useScenes } from "../shared/useLiveLists";

export function SetSceneEditor() {
  const { values, set } = useActionSettings<SetSceneSettings>();
  const connections = useEditorConnections();
  const scenes = useScenes(effectiveConnectionId(connections, values.connection));

  return (
    <EditorPage>
      <ConnectionSelect connections={connections} value={values.connection} onChange={set("connection")} />
      <PickerSelect
        label="Scene"
        placeholder="Choose a Scene"
        options={scenes}
        value={values.scene}
        onChange={set("scene")}
      />
    </EditorPage>
  );
}

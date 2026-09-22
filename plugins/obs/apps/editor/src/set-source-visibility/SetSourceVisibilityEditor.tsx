import { EditorPage, useActionSettings } from "@fluxta/sdk/ui";
import type { SetSourceVisibilitySettings, VisibilityMode } from "obs-protocol";

import { ConnectionSelect } from "../shared/ConnectionSelect";
import { effectiveConnectionId } from "../shared/effectiveConnectionId";
import { ModeSelect } from "../shared/ModeSelect";
import { PickerSelect } from "../shared/PickerSelect";
import { useEditorConnections } from "../shared/useEditorConnections";
import { useSceneSources, useScenes } from "../shared/useLiveLists";

const MODE_OPTIONS: readonly { value: VisibilityMode; label: string }[] = [
  { value: "show", label: "Show" },
  { value: "hide", label: "Hide" },
  { value: "toggle", label: "Toggle" },
];

export function SetSourceVisibilityEditor() {
  const { values, set, update } = useActionSettings<SetSourceVisibilitySettings>();
  const connections = useEditorConnections();
  const activeConnectionId = effectiveConnectionId(connections, values.connection);
  const scenes = useScenes(activeConnectionId);
  const sources = useSceneSources(activeConnectionId, values.scene);

  return (
    <EditorPage>
      <ConnectionSelect connections={connections} value={values.connection} onChange={set("connection")} />
      <PickerSelect
        label="Scene"
        placeholder="Choose a Scene"
        options={scenes}
        value={values.scene}
        onChange={(scene) =>
          // A Source picked against the previous Scene has no reason to
          // still be right against a new one.
          update({ scene, source: undefined })
        }
      />
      <PickerSelect
        label="Source"
        placeholder={values.scene ? "Choose a Source" : "Choose a Scene first"}
        options={sources}
        value={values.source}
        onChange={set("source")}
      />
      <ModeSelect value={values.mode} options={MODE_OPTIONS} onChange={set("mode")} />
    </EditorPage>
  );
}

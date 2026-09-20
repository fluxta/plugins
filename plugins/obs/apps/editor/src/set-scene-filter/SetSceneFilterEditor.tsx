import { EditorPage, useActionSettings } from "@fluxta/sdk/ui";
import type { FilterMode, SetSceneFilterSettings } from "obs-protocol";

import { ConnectionSelect } from "../shared/ConnectionSelect";
import { effectiveConnectionId } from "../shared/effectiveConnectionId";
import { ModeSelect } from "../shared/ModeSelect";
import { PickerSelect } from "../shared/PickerSelect";
import { useEditorConnections } from "../shared/useEditorConnections";
import { useFilters, useScenes } from "../shared/useLiveLists";

const MODE_OPTIONS: readonly { value: FilterMode; label: string }[] = [
  { value: "enable", label: "Enable" },
  { value: "disable", label: "Disable" },
  { value: "toggle", label: "Toggle" },
];

export function SetSceneFilterEditor() {
  const { values, set, update } = useActionSettings<SetSceneFilterSettings>();
  const connections = useEditorConnections();
  const activeConnectionId = effectiveConnectionId(connections, values.connection);
  const scenes = useScenes(activeConnectionId);
  // A Scene is a Source under the hood, so the Source Filter cascade's own
  // `useFilters` hook works unchanged here — it only ever needs a name.
  const filters = useFilters(activeConnectionId, values.scene);

  return (
    <EditorPage>
      <ConnectionSelect connections={connections} value={values.connection} onChange={set("connection")} />
      <PickerSelect
        label="Scene"
        placeholder="Choose a Scene"
        options={scenes}
        value={values.scene}
        onChange={(scene) =>
          // A Filter picked against the previous Scene has no reason to
          // still exist on a different one.
          update({ scene, filter: undefined })
        }
      />
      <PickerSelect
        label="Filter"
        placeholder={values.scene ? "Choose a Filter" : "Choose a Scene first"}
        options={filters}
        value={values.filter}
        onChange={set("filter")}
      />
      <ModeSelect value={values.mode} options={MODE_OPTIONS} onChange={set("mode")} />
    </EditorPage>
  );
}

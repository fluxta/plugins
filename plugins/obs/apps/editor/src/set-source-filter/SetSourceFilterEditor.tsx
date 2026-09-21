import { EditorPage, useActionSettings } from "@fluxta/sdk/ui";
import type { FilterMode, SetSourceFilterSettings } from "obs-protocol";

import { ConnectionSelect } from "../shared/ConnectionSelect";
import { effectiveConnectionId } from "../shared/effectiveConnectionId";
import { ModeSelect } from "../shared/ModeSelect";
import { PickerSelect } from "../shared/PickerSelect";
import { useEditorConnections } from "../shared/useEditorConnections";
import { useFilters, useSceneSources, useScenes } from "../shared/useLiveLists";

const MODE_OPTIONS: readonly { value: FilterMode; label: string }[] = [
  { value: "enable", label: "Enable" },
  { value: "disable", label: "Disable" },
  { value: "toggle", label: "Toggle" },
];

export function SetSourceFilterEditor() {
  const { values, set, update } = useActionSettings<SetSourceFilterSettings>();
  const connections = useEditorConnections();
  const activeConnectionId = effectiveConnectionId(connections, values.connection);
  const scenes = useScenes(activeConnectionId);
  // A Filter belongs to the Source itself, not to any Scene — `scene` only
  // narrows this picker, it is never read by the Action (see the settings
  // type's own doc comment).
  const sources = useSceneSources(activeConnectionId, values.scene);
  const filters = useFilters(activeConnectionId, values.source);

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
          update({ scene, source: undefined, filter: undefined })
        }
      />
      <PickerSelect
        label="Source"
        placeholder={values.scene ? "Choose a Source" : "Choose a Scene first"}
        options={sources}
        value={values.source}
        onChange={(source) =>
          // A Filter picked against the previous Source has no reason to
          // still exist on a different one.
          update({ source, filter: undefined })
        }
      />
      <PickerSelect
        label="Filter"
        placeholder={values.source ? "Choose a Filter" : "Choose a Source first"}
        options={filters}
        value={values.filter}
        onChange={set("filter")}
      />
      <ModeSelect value={values.mode} options={MODE_OPTIONS} onChange={set("mode")} />
    </EditorPage>
  );
}

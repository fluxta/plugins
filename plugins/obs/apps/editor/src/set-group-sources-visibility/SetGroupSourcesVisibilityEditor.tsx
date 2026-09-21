import { EditorPage, useActionSettings } from "@fluxta/sdk/ui";
import type { SetGroupSourcesVisibilitySettings, VisibilityMode } from "obs-protocol";

import { ConnectionSelect } from "../shared/ConnectionSelect";
import { effectiveConnectionId } from "../shared/effectiveConnectionId";
import { ModeSelect } from "../shared/ModeSelect";
import { PickerSelect } from "../shared/PickerSelect";
import { useEditorConnections } from "../shared/useEditorConnections";
import { useGroups } from "../shared/useLiveLists";

const MODE_OPTIONS: readonly { value: VisibilityMode; label: string }[] = [
  { value: "show", label: "Show" },
  { value: "hide", label: "Hide" },
  { value: "toggle", label: "Toggle" },
];

export function SetGroupSourcesVisibilityEditor() {
  const { values, set } = useActionSettings<SetGroupSourcesVisibilitySettings>();
  const connections = useEditorConnections();
  const groups = useGroups(effectiveConnectionId(connections, values.connection));

  return (
    <EditorPage>
      <ConnectionSelect connections={connections} value={values.connection} onChange={set("connection")} />
      <PickerSelect
        label="Group"
        placeholder="Choose a Group"
        options={groups}
        value={values.group}
        onChange={set("group")}
      />
      <ModeSelect value={values.mode} options={MODE_OPTIONS} onChange={set("mode")} />
      <p className="text-muted-foreground text-xs/relaxed">
        Applies to every Source inside the Group at once.
      </p>
    </EditorPage>
  );
}

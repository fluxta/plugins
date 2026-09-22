import { ColorField, EditorPage, useActionSettings } from "@fluxta/sdk/ui";
import type { ColorMode, SetColorSourceSettings } from "obs-protocol";

import { ConnectionSelect } from "../shared/ConnectionSelect";
import { effectiveConnectionId } from "../shared/effectiveConnectionId";
import { ModeSelect } from "../shared/ModeSelect";
import { PickerSelect } from "../shared/PickerSelect";
import { useEditorConnections } from "../shared/useEditorConnections";
import { useInputs } from "../shared/useLiveLists";

// Covers OBS's current Color Source kind and its pre-v3/pre-v2 predecessors.
const COLOR_INPUT_KINDS = ["color_source_v3", "color_source_v2", "color_source"];

const MODE_OPTIONS: readonly { value: ColorMode; label: string }[] = [
  { value: "fixed", label: "Fixed color" },
  { value: "random", label: "Random color" },
];

export function SetColorSourceEditor() {
  const { values, set } = useActionSettings<SetColorSourceSettings>({ color: "#ffffff" });
  const connections = useEditorConnections();
  const inputs = useInputs(
    effectiveConnectionId(connections, values.connection),
    COLOR_INPUT_KINDS,
  );

  return (
    <EditorPage>
      <ConnectionSelect connections={connections} value={values.connection} onChange={set("connection")} />
      <PickerSelect
        label="Color Source"
        placeholder="Choose an Input"
        options={inputs}
        value={values.input}
        onChange={set("input")}
      />
      <ModeSelect value={values.mode} options={MODE_OPTIONS} onChange={set("mode")} />
      {values.mode === "fixed" ? (
        <ColorField label="Color" value={values.color} onChange={set("color")} />
      ) : null}
    </EditorPage>
  );
}

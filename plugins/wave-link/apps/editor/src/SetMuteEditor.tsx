import { SelectField, useActionSettings } from "@fluxta/sdk/ui";
import type { MuteSettings } from "wave-link-protocol";
import { ActionEditorPage } from "./ActionEditorPage";
import { useStatus } from "./use-status";

export function SetMuteEditor() {
  const { values, update, set } = useActionSettings<MuteSettings>({
    targetKind: "channel",
    mode: "toggle",
  });
  const { data: status } = useStatus();
  return (
    <ActionEditorPage
      target={values}
      onTargetChange={update}
      status={status}
      field="muted"
    >
      <SelectField
        label="Mode"
        value={values.mode}
        onChange={(mode) => set("mode")(mode as MuteSettings["mode"])}
        options={[
          { value: "mute", label: "Mute" },
          { value: "unmute", label: "Unmute" },
          { value: "toggle", label: "Toggle" },
        ]}
        hint="Changes only this Target's mute. Other Channel and Mix mute settings remain independent."
      />
    </ActionEditorPage>
  );
}

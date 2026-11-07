import { useActionSettings } from "@fluxta/sdk/ui";
import type { VolumeSettings } from "wave-link-protocol";
import { ActionEditorPage } from "./ActionEditorPage";
import { useStatus } from "./use-status";
import { VolumeField } from "./VolumeField";

export function SetVolumeEditor() {
  const { values, update, set } = useActionSettings<VolumeSettings>({
    targetKind: "channel",
    volumePercent: "100",
  });
  const { data: status } = useStatus();
  return (
    <ActionEditorPage
      target={values}
      onTargetChange={update}
      status={status}
      field="volumePercent"
    >
      <VolumeField
        kind="volume"
        value={values.volumePercent}
        onChange={set("volumePercent")}
      />
    </ActionEditorPage>
  );
}

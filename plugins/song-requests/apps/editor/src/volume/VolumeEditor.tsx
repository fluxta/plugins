import {
  EditorPage,
  SelectField,
  TemplateField,
  useActionSettings,
} from "@fluxta/sdk/ui";
import type { VolumeSettings } from "song-requests-protocol";

export function VolumeEditor() {
  const { values, set } = useActionSettings<VolumeSettings>({
    mode: "set",
    amount: "50",
  });
  return (
    <EditorPage>
      <SelectField
        label="Volume"
        value={values.mode ?? "set"}
        onChange={(value) => set("mode")(value as VolumeSettings["mode"])}
        options={[
          { value: "set", label: "Set" },
          { value: "change", label: "Change by" },
        ]}
      />
      <TemplateField
        label={
          values.mode === "change" ? "Change (Percentage Points)" : "Volume (%)"
        }
        value={values.amount ?? "50"}
        onChange={set("amount")}
        hint="Set a volume from 0 to 100, or change it by a signed amount such as +10 or -10. The result is kept within 0–100 and survives a restart. Later steps can read Volume."
      />
    </EditorPage>
  );
}

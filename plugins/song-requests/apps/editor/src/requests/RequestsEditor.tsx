import { EditorPage, SelectField, useActionSettings } from "@fluxta/sdk/ui";
import type { RequestsSettings } from "song-requests-protocol";

export function RequestsEditor() {
  const { values, set } = useActionSettings<RequestsSettings>({
    mode: "toggle",
  });
  return (
    <EditorPage>
      <SelectField
        label="Requests"
        value={values.mode ?? "toggle"}
        onChange={(value) => set("mode")(value as RequestsSettings["mode"])}
        options={[
          { value: "open", label: "Open" },
          { value: "close", label: "Close" },
          { value: "toggle", label: "Toggle" },
        ]}
        hint="Changes Requests Open and keeps it across restarts. Playback continues. Later steps can read Is Open."
      />
    </EditorPage>
  );
}

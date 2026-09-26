import { EditorPage, TemplateField, useActionSettings } from "@fluxta/sdk/ui";
import { COMMERCIAL_LENGTHS, type RunCommercialSettings } from "platforms-protocol";

export function RunCommercialEditor() {
  const { values, set } = useActionSettings<Required<RunCommercialSettings>>({
    length: "60",
  });

  return (
    <EditorPage>
      <TemplateField
        label="Length, seconds"
        value={values.length}
        onChange={set("length")}
        placeholder="60"
        hint={`Twitch only accepts ${COMMERCIAL_LENGTHS.join(", ")} seconds.`}
      />
    </EditorPage>
  );
}

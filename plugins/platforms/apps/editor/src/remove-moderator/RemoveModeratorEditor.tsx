import { EditorPage, TemplateField, useActionSettings } from "@fluxta/sdk/ui";
import type { RemoveModeratorSettings } from "platforms-protocol";

import { usePrefillLogin } from "../shared/usePrefillLogin";

export function RemoveModeratorEditor() {
  const { values, set, loaded } = useActionSettings<Required<RemoveModeratorSettings>>({
    login: "",
  });

  usePrefillLogin(values.login, set("login"), loaded);

  return (
    <EditorPage>
      <TemplateField
        label="Viewer"
        value={values.login}
        onChange={set("login")}
        placeholder="Login of the moderator to remove"
        hint="Filled in from the event that named a viewer, when this action sits under one."
      />
    </EditorPage>
  );
}

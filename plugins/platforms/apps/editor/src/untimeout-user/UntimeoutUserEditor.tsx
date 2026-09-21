import { EditorPage, TemplateField, useActionSettings } from "@fluxta/sdk/ui";
import type { UntimeoutUserSettings } from "platforms-protocol";

import { usePrefillLogin } from "../shared/usePrefillLogin";

export function UntimeoutUserEditor() {
  const { values, set, loaded } = useActionSettings<Required<UntimeoutUserSettings>>({
    login: "",
  });

  usePrefillLogin(values.login, set("login"), loaded);

  return (
    <EditorPage>
      <TemplateField
        label="Viewer"
        value={values.login}
        onChange={set("login")}
        placeholder="Login of the viewer to untimeout"
        hint="Filled in from the event that named a viewer, when this action sits under one."
      />
    </EditorPage>
  );
}

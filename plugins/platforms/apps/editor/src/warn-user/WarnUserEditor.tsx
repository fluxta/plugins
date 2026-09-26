import { EditorPage, TemplateField, useActionSettings } from "@fluxta/sdk/ui";
import type { WarnUserSettings } from "platforms-protocol";

import { usePrefillLogin } from "../shared/usePrefillLogin";

export function WarnUserEditor() {
  const { values, set, loaded } = useActionSettings<Required<WarnUserSettings>>({
    login: "",
    reason: "",
  });

  usePrefillLogin(values.login, set("login"), loaded);

  return (
    <EditorPage>
      <TemplateField
        label="Viewer"
        value={values.login}
        onChange={set("login")}
        placeholder="Login of the viewer to warn"
        hint="Filled in from the event that named a viewer, when this action sits under one."
      />

      <TemplateField
        label="Reason"
        value={values.reason}
        onChange={set("reason")}
        placeholder="Watch the language"
        hint="Shown to the viewer, and must be acknowledged before they can chat again. Twitch requires one."
      />
    </EditorPage>
  );
}

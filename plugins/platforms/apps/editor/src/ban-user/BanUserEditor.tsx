import { EditorPage, TemplateField, useActionSettings } from "@fluxta/sdk/ui";
import { MODERATION_REASON_MAX, type BanUserSettings } from "platforms-protocol";

import { usePrefillLogin } from "../shared/usePrefillLogin";

export function BanUserEditor() {
  const { values, set, loaded } = useActionSettings<Required<BanUserSettings>>({
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
        placeholder="Login of the viewer to ban"
        hint="Filled in from the event that named a viewer, when this action sits under one."
      />

      <TemplateField
        label="Reason"
        value={values.reason}
        onChange={set("reason")}
        placeholder="Optional"
        hint={`Shown to the viewer and other moderators. Twitch's cap is ${MODERATION_REASON_MAX} characters.`}
      />
    </EditorPage>
  );
}

import { EditorPage, TemplateField, useActionSettings } from "@fluxta/sdk/ui";
import {
  MODERATION_REASON_MAX,
  TIMEOUT_DURATION_MAX,
  TIMEOUT_DURATION_MIN,
  type TimeoutUserSettings,
} from "platforms-protocol";

import { usePrefillLogin } from "../shared/usePrefillLogin";

export function TimeoutUserEditor() {
  const { values, set, loaded } = useActionSettings<Required<TimeoutUserSettings>>({
    login: "",
    duration: "600",
    reason: "",
  });

  usePrefillLogin(values.login, set("login"), loaded);

  return (
    <EditorPage>
      <TemplateField
        label="Viewer"
        value={values.login}
        onChange={set("login")}
        placeholder="Login of the viewer to time out"
        hint="Filled in from the event that named a viewer, when this action sits under one."
      />

      <TemplateField
        label="Duration, seconds"
        value={values.duration}
        onChange={set("duration")}
        placeholder="600"
        hint={`Between ${TIMEOUT_DURATION_MIN} and ${TIMEOUT_DURATION_MAX} seconds.`}
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

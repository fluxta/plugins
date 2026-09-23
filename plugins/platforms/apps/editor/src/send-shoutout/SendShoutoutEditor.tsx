import { EditorPage, TemplateField, useActionSettings } from "@fluxta/sdk/ui";
import type { SendShoutoutSettings } from "platforms-protocol";

import { usePrefillLogin } from "../shared/usePrefillLogin";

export function SendShoutoutEditor() {
  const { values, set, loaded } = useActionSettings<Required<SendShoutoutSettings>>({
    login: "",
  });

  usePrefillLogin(values.login, set("login"), loaded);

  return (
    <EditorPage>
      <TemplateField
        label="Channel"
        value={values.login}
        onChange={set("login")}
        placeholder="Login of the channel to shout out"
        hint="Filled in from the event that named a channel — a Raid, say — when this action sits under one."
      />
    </EditorPage>
  );
}

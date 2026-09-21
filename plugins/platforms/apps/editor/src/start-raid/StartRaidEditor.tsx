import { EditorPage, TemplateField, useActionSettings } from "@fluxta/sdk/ui";
import type { StartRaidSettings } from "platforms-protocol";

import { usePrefillLogin } from "../shared/usePrefillLogin";

export function StartRaidEditor() {
  const { values, set, loaded } = useActionSettings<Required<StartRaidSettings>>({
    login: "",
  });

  usePrefillLogin(values.login, set("login"), loaded);

  return (
    <EditorPage>
      <TemplateField
        label="Channel"
        value={values.login}
        onChange={set("login")}
        placeholder="Login of the channel to raid"
        hint="Both channels must be live for Twitch to accept the raid."
      />
    </EditorPage>
  );
}

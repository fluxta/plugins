import { EditorPage, useActionSettings } from "@fluxta/sdk/ui";
import type { TimerActionSettings } from "timers-protocol";

import { TimerField } from "../shared/TimerField";
import { useEditorStatus } from "../shared/useEditorStatus";

/** Cancel Timer's Action Editor: only which Timer. */
export function TimerActionEditor() {
  const { values, set } = useActionSettings<TimerActionSettings>();

  return (
    <EditorPage>
      <TimerField
        status={useEditorStatus()}
        value={values.timer}
        onChange={set("timer")}
        hint="Stops its countdown so it does not fire. An idle Timer is left as it is."
      />
    </EditorPage>
  );
}

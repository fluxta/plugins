import { EditorPage, TemplateField, useActionSettings } from "@fluxta/sdk/ui";
import type { AddTimeSettings } from "timers-protocol";

import { durationFieldError } from "../shared/durationFieldError";
import { TimerField } from "../shared/TimerField";
import { useEditorStatus } from "../shared/useEditorStatus";

export function AddTimeEditor() {
  const { values, set } = useActionSettings<AddTimeSettings>();

  return (
    <EditorPage>
      <TimerField
        status={useEditorStatus()}
        value={values.timer}
        onChange={set("timer")}
        hint="Fires later by the amount — a repeating Timer only this once, then back on its schedule. An idle Timer has no countdown to extend and is left as it is."
      />
      <TemplateField
        label="Amount"
        value={values.amount ?? ""}
        onChange={set("amount")}
        placeholder="5:00"
        error={durationFieldError(values.amount)}
        hint="Seconds (300) or a clock time (5:00) — or a variable holding one."
      />
    </EditorPage>
  );
}

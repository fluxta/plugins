import { EditorPage, TemplateField, useActionSettings } from "@fluxta/sdk/ui";
import { formatDuration, type StartTimerSettings } from "timers-protocol";

import { durationFieldError } from "../shared/durationFieldError";
import { TimerField } from "../shared/TimerField";
import { useEditorStatus } from "../shared/useEditorStatus";

export function StartTimerEditor() {
  const { values, set } = useActionSettings<StartTimerSettings>();
  const status = useEditorStatus();
  const timer = status?.timers.find(({ id }) => id === values.timer);

  return (
    <EditorPage>
      <TimerField
        status={status}
        value={values.timer}
        onChange={set("timer")}
        hint="Counts down and fires Timer Elapsed when it runs out — a repeating Timer every time. If it is already running, the Timer’s own setting says whether it starts over."
      />
      <TemplateField
        label="Duration"
        value={values.duration ?? ""}
        onChange={set("duration")}
        placeholder={
          timer ? formatDuration(timer.durationMs) : "The Timer’s own"
        }
        error={durationFieldError(values.duration)}
        hint="Empty counts the Timer’s own duration; a repeating Timer repeats this one. Seconds (900) or a clock time (15:00, 1:30:00) — or a variable holding one."
      />
    </EditorPage>
  );
}

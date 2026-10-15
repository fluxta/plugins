import { EditorPage, SelectField, useActionSettings } from "@fluxta/sdk/ui";
import type { StopwatchActionSettings } from "timers-protocol";

import { useEditorStatus } from "../shared/useEditorStatus";

/**
 * The one Action Editor of Start, Pause, Reset and Read Stopwatch: each
 * needs only to know which Stopwatch, and Fluxta does not tell an editor
 * which Action it edits — so the page says what all four do.
 */
export function StopwatchActionEditor() {
  const { values, set } = useActionSettings<StopwatchActionSettings>();
  const status = useEditorStatus();
  const stopwatches = status?.stopwatches ?? [];

  return (
    <EditorPage>
      {status && stopwatches.length === 0 ? (
        <p className="text-muted-foreground text-xs/relaxed">
          No Stopwatch yet. Add one in the Timers plugin’s settings.
        </p>
      ) : null}
      <SelectField
        label="Stopwatch"
        placeholder="Choose a Stopwatch"
        options={stopwatches.map((stopwatch) => ({
          value: stopwatch.id,
          label: stopwatch.name,
        }))}
        loading={!status}
        value={values.stopwatch}
        onChange={set("stopwatch")}
        missingLabel="A Stopwatch that no longer exists"
        hint="Start resumes a paused Stopwatch. Pause, Read and Reset hand its time to later steps — Reset the time it had before it was reset: Elapsed (2:14:05), and Hours, Minutes and Seconds (2, 14, 5) to write it in your own words, such as “2 h 14 min”."
      />
    </EditorPage>
  );
}

import { Dialog, TextField } from "@fluxta/sdk/ui";
import { useState } from "react";
import { validateStopwatchName, type Stopwatch } from "timers-protocol";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  name: string;
  /** The Stopwatch being renamed. Absent when adding one. */
  editingId?: string;
  /** Every configured Stopwatch, so a clashing name is caught early. */
  stopwatches: readonly Stopwatch[];
  onSave: (name: string) => void;
};

export function StopwatchDialog(props: Props) {
  const { open, onOpenChange, title, editingId, stopwatches, onSave } = props;
  const [name, setName] = useState(props.name);

  // A reopened dialog shows the name as it stands now, not whatever was last
  // typed into it — reset while rendering the opening, which React prefers
  // over an effect that would render the stale value first.
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);

    if (open) {
      setName(props.name);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      onSubmit={() => {
        const problem = validateStopwatchName(name, stopwatches, editingId);

        if (problem) {
          return problem;
        }

        onSave(name.trim());
      }}
    >
      <TextField
        label="Name"
        value={name}
        onChange={setName}
        placeholder="On air"
        hint="Shown wherever a step or a condition picks this Stopwatch."
      />
    </Dialog>
  );
}

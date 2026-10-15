import { Button, EmptyState, Section } from "@fluxta/sdk/ui";
import { useState } from "react";
import type { EditorMessage, Stopwatch } from "timers-protocol";

import { StopwatchDialog } from "./StopwatchDialog";
import { StopwatchRow } from "./StopwatchRow";

type Props = {
  stopwatches: readonly Stopwatch[];
  /** When the shown status arrived. */
  statusAt: number;
  send: (message: EditorMessage) => void;
};

export function StopwatchesCard({ stopwatches, statusAt, send }: Props) {
  const [adding, setAdding] = useState(false);

  return (
    <Section
      title="Stopwatches"
      description="A Stopwatch counts time while it runs, across pauses — and keeps counting while Fluxta is closed. Steps start, pause, read and reset it; an If/Else can ask whether it is idle, running or paused."
      actions={
        <Button variant="outline" onClick={() => setAdding(true)}>
          Add Stopwatch
        </Button>
      }
    >
      {stopwatches.length === 0 ? (
        <EmptyState>No Stopwatch yet.</EmptyState>
      ) : (
        stopwatches.map((stopwatch) => (
          <StopwatchRow
            key={stopwatch.id}
            stopwatch={stopwatch}
            stopwatches={stopwatches}
            statusAt={statusAt}
            send={send}
          />
        ))
      )}

      <StopwatchDialog
        open={adding}
        onOpenChange={setAdding}
        title="Add Stopwatch"
        name=""
        stopwatches={stopwatches}
        onSave={(name) => send({ event: "create-stopwatch", name })}
      />
    </Section>
  );
}

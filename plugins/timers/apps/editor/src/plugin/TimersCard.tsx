import { Button, EmptyState, Section } from "@fluxta/sdk/ui";
import { useState } from "react";
import type { EditorMessage, Timer } from "timers-protocol";

import { TimerDialog } from "./TimerDialog";
import { TimerRow } from "./TimerRow";

type Props = {
  timers: readonly Timer[];
  /** When the shown status arrived. */
  statusAt: number;
  send: (message: EditorMessage) => void;
};

export function TimersCard({ timers, statusAt, send }: Props) {
  const [adding, setAdding] = useState(false);

  return (
    <Section
      title="Timers"
      description="A Timer counts down and fires the Timer Elapsed Event when it runs out — even if it ran out while Fluxta was closed, as soon as Fluxta is back. Steps start, cancel and add time to it; an If/Else can ask whether it is running and how long it has left."
      actions={
        <Button variant="outline" onClick={() => setAdding(true)}>
          Add Timer
        </Button>
      }
    >
      {timers.length === 0 ? (
        <EmptyState>No Timer yet.</EmptyState>
      ) : (
        timers.map((timer) => (
          <TimerRow
            key={timer.id}
            timer={timer}
            timers={timers}
            statusAt={statusAt}
            send={send}
          />
        ))
      )}

      <TimerDialog
        open={adding}
        onOpenChange={setAdding}
        title="Add Timer"
        timers={timers}
        onSave={(fields) => send({ event: "create-timer", timer: fields })}
      />
    </Section>
  );
}

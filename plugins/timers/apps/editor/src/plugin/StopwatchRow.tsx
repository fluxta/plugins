import {
  Button,
  ListRow,
  StatusBadge,
  useConfirm,
  type StatusTone,
} from "@fluxta/sdk/ui";
import { useState } from "react";
import {
  elapsedMs,
  formatClock,
  type EditorMessage,
  type Stopwatch,
  type StopwatchState,
} from "timers-protocol";

import { useNow } from "../shared/useNow";
import { StopwatchDialog } from "./StopwatchDialog";

type Props = {
  stopwatch: Stopwatch;
  stopwatches: readonly Stopwatch[];
  /** When the shown status arrived. */
  statusAt: number;
  send: (message: EditorMessage) => void;
};

const TONES: Record<StopwatchState, StatusTone> = {
  idle: "idle",
  running: "ok",
  paused: "pending",
};

const LABELS: Record<StopwatchState, string> = {
  idle: "Idle",
  running: "Running",
  paused: "Paused",
};

export function StopwatchRow({
  stopwatch,
  stopwatches,
  statusAt,
  send,
}: Props) {
  const [renaming, setRenaming] = useState(false);
  const confirm = useConfirm();
  const { timing } = stopwatch;
  // Shown in whole seconds, rounded down: it changes as each one completes.
  const now = useNow(statusAt, (now) =>
    timing.state === "running"
      ? now + 1000 - (elapsedMs(timing, now) % 1000)
      : undefined,
  );

  return (
    <>
      <ListRow
        title={stopwatch.name}
        badges={
          <StatusBadge tone={TONES[timing.state]}>
            {LABELS[timing.state]}
          </StatusBadge>
        }
        description={
          timing.state === "idle"
            ? "Not started"
            : formatClock(elapsedMs(timing, now))
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setRenaming(true)}>
              Rename
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                const sure = await confirm({
                  title: `Delete "${stopwatch.name}"?`,
                  description:
                    "Every step and condition pointed at this Stopwatch will do nothing until it is given another one.",
                  confirmLabel: "Delete",
                  destructive: true,
                });

                if (sure) {
                  send({ event: "delete-stopwatch", id: stopwatch.id });
                }
              }}
            >
              Delete
            </Button>
          </>
        }
      />
      <StopwatchDialog
        open={renaming}
        onOpenChange={setRenaming}
        title="Rename Stopwatch"
        name={stopwatch.name}
        editingId={stopwatch.id}
        stopwatches={stopwatches}
        onSave={(name) =>
          send({ event: "rename-stopwatch", id: stopwatch.id, name })
        }
      />
    </>
  );
}

import {
  Button,
  ListRow,
  StatusBadge,
  useConfirm,
  type StatusTone,
} from "@fluxta/sdk/ui";
import { useState } from "react";
import {
  formatDuration,
  elapse,
  lastCycleOf,
  remainingMs,
  type Countdown,
  type EditorMessage,
  type Timer,
  type TimerState,
} from "timers-protocol";

import { useNow } from "../shared/useNow";
import { TimerDialog } from "./TimerDialog";

type Props = {
  timer: Timer;
  timers: readonly Timer[];
  /** When the shown status arrived. */
  statusAt: number;
  send: (message: EditorMessage) => void;
};

const TONES: Record<TimerState, StatusTone> = {
  idle: "idle",
  running: "ok",
};

const LABELS: Record<TimerState, string> = {
  idle: "Idle",
  running: "Running",
};

export function TimerRow({ timer, timers, statusAt, send }: Props) {
  const [editing, setEditing] = useState(false);
  const confirm = useConfirm();
  // Shown in whole seconds, rounded up: it changes as each one runs out.
  const now = useNow(statusAt, (now) => {
    const left = remainingMs(countdownAt(timer, now), now);
    return left === undefined ? undefined : now + (left % 1000 || 1000);
  });
  const countdown = countdownAt(timer, now);
  const left = remainingMs(countdown, now);

  return (
    <>
      <ListRow
        title={timer.name}
        badges={
          <StatusBadge tone={TONES[countdown.state]}>
            {LABELS[countdown.state]}
          </StatusBadge>
        }
        description={
          left === undefined
            ? describeTimer(timer)
            : // Rounded up, as a countdown reads.
              `${formatDuration(Math.ceil(left / 1000) * 1000)} left${describeCycle(timer, countdown)}`
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                const sure = await confirm({
                  title: `Delete "${timer.name}"?`,
                  description:
                    "It will not fire, and every step, condition and Event pointed at this Timer will do nothing until it is given another one.",
                  confirmLabel: "Delete",
                  destructive: true,
                });

                if (sure) {
                  send({ event: "delete-timer", id: timer.id });
                }
              }}
            >
              Delete
            </Button>
          </>
        }
      />
      <TimerDialog
        open={editing}
        onOpenChange={setEditing}
        title="Edit Timer"
        timer={timer}
        timers={timers}
        onSave={(fields) =>
          send({ event: "update-timer", id: timer.id, timer: fields })
        }
      />
    </>
  );
}

/** What an idle Timer will do when started. */
function describeTimer(timer: Timer): string {
  const duration = formatDuration(timer.durationMs);

  if (!timer.repeat) {
    return `Counts down ${duration}`;
  }

  return timer.maxTimes === null
    ? `Every ${duration}`
    : `Every ${duration}, ${timer.maxTimes} times`;
}

/**
 * The countdown as the sidecar has it at `now`. One whose Due Time has come
 * has fired and gone on to its next cycle, or is idle — worked out here with
 * the sidecar's own arithmetic, rather than held at 0:00 until its status
 * arrives.
 */
function countdownAt(timer: Timer, now: number): Countdown {
  const { countdown } = timer;

  return countdown.state === "running" && countdown.dueAt <= now
    ? elapse(timer, countdown, now).next
    : countdown;
}

/** Where a repeating countdown stands in its schedule, or nothing. */
function describeCycle(timer: Timer, countdown: Countdown): string {
  const lastCycle = lastCycleOf(timer);

  if (countdown.state !== "running" || lastCycle === 1) {
    return "";
  }

  return lastCycle === null
    ? `, cycle ${countdown.cycle}`
    : `, cycle ${countdown.cycle} of ${Math.max(countdown.cycle, lastCycle)}`;
}

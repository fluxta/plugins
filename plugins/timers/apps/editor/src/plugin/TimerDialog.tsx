import {
  CheckboxField,
  Dialog,
  NumberField,
  SelectField,
  TextField,
} from "@fluxta/sdk/ui";
import { useState } from "react";
import {
  formatDuration,
  parseDuration,
  validateDuration,
  validateTimerName,
  type RepeatedStart,
  type Timer,
  type TimerFields,
} from "timers-protocol";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** The Timer being edited. Absent when adding one. */
  timer?: Timer;
  /** Every configured Timer, so a clashing name is caught early. */
  timers: readonly Timer[];
  onSave: (fields: TimerFields) => void;
};

const REPEATED_START_OPTIONS: { value: RepeatedStart; label: string }[] = [
  { value: "restart", label: "Count down again from the start" },
  { value: "ignore", label: "Keep counting down as it was" },
];

type Draft = {
  name: string;
  duration: string;
  repeatedStart: RepeatedStart;
  repeat: boolean;
  /** Empty means until cancelled. */
  maxTimes: number | undefined;
};

function draftOf(timer: Timer | undefined): Draft {
  return {
    name: timer?.name ?? "",
    duration: timer ? formatDuration(timer.durationMs) : "",
    repeatedStart: timer?.repeatedStart ?? "restart",
    repeat: timer?.repeat ?? false,
    maxTimes: timer?.maxTimes ?? undefined,
  };
}

/** At most as the Timer holds it: a whole number of times, or `null`. */
function maxTimesOf({ maxTimes }: Draft): number | null | undefined {
  if (maxTimes === undefined) {
    return null;
  }

  return Number.isInteger(maxTimes) && maxTimes >= 1 ? maxTimes : undefined;
}

export function TimerDialog(props: Props) {
  const { open, onOpenChange, title, timer, timers, onSave } = props;
  const [draft, setDraft] = useState(() => draftOf(timer));
  const set =
    <K extends keyof Draft>(key: K) =>
    (value: Draft[K]) =>
      setDraft((current) => ({ ...current, [key]: value }));

  // A reopened dialog shows the Timer as it stands now, not whatever was last
  // typed into it — reset while rendering the opening, which React prefers
  // over an effect that would render the stale value first.
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);

    if (open) {
      setDraft(draftOf(timer));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      onSubmit={() => {
        const problem =
          validateTimerName(draft.name, timers, timer?.id) ??
          validateDuration(draft.duration) ??
          (draft.repeat && maxTimesOf(draft) === undefined
            ? "At most is a whole number of times — or empty, until cancelled."
            : undefined);

        if (problem) {
          return problem;
        }

        onSave({
          name: draft.name.trim(),
          durationMs: parseDuration(draft.duration)!,
          repeatedStart: draft.repeatedStart,
          repeat: draft.repeat,
          // Kept while Repeat is off, so turning it back on finds it again —
          // unless it is not a number of times, which only Repeat checks.
          maxTimes: maxTimesOf(draft) ?? null,
        });
      }}
    >
      <TextField
        label="Name"
        value={draft.name}
        onChange={set("name")}
        placeholder="Grace period"
        hint="Shown wherever a step, a condition or an Event picks this Timer."
      />
      <TextField
        label="Duration"
        value={draft.duration}
        onChange={set("duration")}
        placeholder="15:00"
        hint="Seconds (900) or a clock time (15:00, 1:30:00). Start Timer can count a different one."
      />
      <CheckboxField
        label="Repeat"
        checked={draft.repeat}
        onChange={set("repeat")}
        hint="Fires every duration until cancelled — on a fixed schedule, however late a firing was."
      />
      {draft.repeat ? (
        <NumberField
          label="At most"
          value={draft.maxTimes}
          onChange={set("maxTimes")}
          min={1}
          placeholder="Until cancelled"
          hint="Times, counting any it missed while Fluxta was closed: 4 times every 30:00 is over two hours after Start."
        />
      ) : null}
      <SelectField
        label="When started while running"
        options={REPEATED_START_OPTIONS}
        value={draft.repeatedStart}
        onChange={(value) => set("repeatedStart")(value as RepeatedStart)}
        hint={
          timer?.countdown.state === "running"
            ? "The cycle under way keeps its end. What you change here applies from the next cycle — or, if it does not repeat, the next Start."
            : undefined
        }
      />
    </Dialog>
  );
}

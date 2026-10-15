import type { Options } from "@fluxta/sdk/api";
import { STOPWATCH_STATES, type StopwatchState } from "timers-protocol";

export const STOPWATCH_STATES_OPTIONS = "stopwatchStates";

const LABELS: Record<StopwatchState, string> = {
  idle: "Idle",
  running: "Running",
  paused: "Paused",
};

/** The fixed values `stopwatchState` compares against. */
export function createStopwatchStatesOptions(): Options {
  return {
    key: STOPWATCH_STATES_OPTIONS,
    resolve: () =>
      STOPWATCH_STATES.map((state) => ({ value: state, label: LABELS[state] })),
  };
}

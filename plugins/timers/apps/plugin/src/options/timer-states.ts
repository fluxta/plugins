import type { Options } from "@fluxta/sdk/api";
import { TIMER_STATES, type TimerState } from "timers-protocol";

export const TIMER_STATES_OPTIONS = "timerStates";

const LABELS: Record<TimerState, string> = {
  idle: "Idle",
  running: "Running",
};

/** The fixed values `timerState` compares against. */
export function createTimerStatesOptions(): Options {
  return {
    key: TIMER_STATES_OPTIONS,
    resolve: () =>
      TIMER_STATES.map((state) => ({ value: state, label: LABELS[state] })),
  };
}

/**
 * The settings every Stopwatch Action saves — Start, Pause, Reset and Read
 * share one Action Editor.
 *
 * `stopwatch` is a Stopwatch's id. Unset, or naming a Stopwatch that has
 * since been deleted, the Action does nothing.
 */
export type StopwatchActionSettings = {
  stopwatch?: string;
};

/**
 * The settings of Cancel Timer, and the part every Timer Action shares.
 *
 * `timer` is a Timer's id. Unset, or naming a Timer that has since been
 * deleted, the Action does nothing.
 */
export type TimerActionSettings = {
  timer?: string;
};

/**
 * Start Timer's settings. `duration` overrides the Timer's own for this
 * countdown; empty means the Timer's own. It may hold a `{{…}}` reference, so
 * what the sidecar receives can be a number as well as text — read it with
 * `parseDuration`.
 */
export type StartTimerSettings = TimerActionSettings & {
  duration?: string;
};

/**
 * Add Time's settings. `amount` is added to a running countdown; like
 * Start's `duration`, it may hold a `{{…}}` reference.
 */
export type AddTimeSettings = TimerActionSettings & {
  amount?: string;
};

/**
 * Wakes the sidecar once, after about `delayMs`, and returns what cancels
 * that wake. Injected into `Timers` so tests decide when time passes.
 */
export type Scheduler = (delayMs: number, wake: () => void) => () => void;

export const systemScheduler: Scheduler = (delayMs, wake) => {
  const handle = setTimeout(wake, delayMs);
  return () => clearTimeout(handle);
};

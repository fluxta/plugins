/** Schedules `run` after `ms` milliseconds; the returned function cancels it. */
export type Schedule = (ms: number, run: () => void) => () => void;

export const schedule: Schedule = (ms, run) => {
  const timer = setTimeout(run, ms);
  return () => clearTimeout(timer);
};

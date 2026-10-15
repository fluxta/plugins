/**
 * Logs a Stopwatch Action that found nothing to act on. The step does
 * nothing and the run goes on: a Stopwatch deleted after its steps were
 * saved should not break every scenario that used it.
 */
export function warnNoStopwatch(action: string, id: string | undefined): void {
  console.warn(
    id
      ? `${action} did nothing: Stopwatch ${id} no longer exists`
      : `${action} did nothing: no Stopwatch is chosen`,
  );
}

/**
 * Logs a Timer Action that found nothing to act on. The step does nothing
 * and the run goes on: a Timer deleted after its steps were saved should not
 * break every scenario that used it.
 */
export function warnNoTimer(action: string, id: string | undefined): void {
  console.warn(
    id
      ? `${action} did nothing: Timer ${id} no longer exists`
      : `${action} did nothing: no Timer is chosen`,
  );
}

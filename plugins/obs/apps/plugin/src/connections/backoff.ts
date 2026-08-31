const INITIAL_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

/**
 * The retry delay for one Connection's reconnect loop: doubles on every
 * failed attempt, capped at {@link MAX_DELAY_MS}, and resets once a connect
 * actually succeeds. OBS being closed is an expected, indefinite state, not
 * a fault to give up over.
 */
export class Backoff {
  private delayMs = INITIAL_DELAY_MS;

  /** The delay to wait before the next attempt, doubling for the one after. */
  next(): number {
    const current = this.delayMs;
    this.delayMs = Math.min(this.delayMs * 2, MAX_DELAY_MS);
    return current;
  }

  /** Call after a successful connect, so the next failure starts over at the bottom. */
  reset(): void {
    this.delayMs = INITIAL_DELAY_MS;
  }
}

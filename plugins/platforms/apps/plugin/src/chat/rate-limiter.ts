/**
 * Twitch enforces two chat limits at once, and both have to be honoured:
 * a cap per rolling window, and a minimum gap between messages.
 *
 * The broadcaster and moderators get the larger window cap, so for them the
 * one-per-second gap is what actually binds; for everyone else the window cap
 * is reached first.
 */
export type RateLimit = {
  /** Messages allowed in one window. */
  perWindow: number;
  windowMs: number;
  /** Smallest gap between two messages. */
  minGapMs: number;
};

/** A regular account: 20 messages per 30 seconds, at most one per second. */
export const REGULAR_LIMIT: RateLimit = { perWindow: 20, windowMs: 30_000, minGapMs: 1000 };

/** The broadcaster or a moderator: 100 per 30 seconds, still one per second. */
export const ELEVATED_LIMIT: RateLimit = { perWindow: 100, windowMs: 30_000, minGapMs: 1000 };

/**
 * Tracks what has been sent and says how long to wait before sending again.
 *
 * Time is passed in rather than read, so the whole policy is exercisable
 * without waiting for real seconds to pass.
 */
export class RateLimiter {
  private readonly sentAt: number[] = [];

  constructor(private readonly limit: RateLimit) {}

  /** Milliseconds to wait before the next message may be sent. */
  delayBefore(now: number): number {
    this.forget(now);

    const sinceLast = this.sentAt.length
      ? now - (this.sentAt.at(-1) as number)
      : Number.POSITIVE_INFINITY;
    const gapWait = Math.max(this.limit.minGapMs - sinceLast, 0);

    if (this.sentAt.length < this.limit.perWindow) {
      return gapWait;
    }

    // The window is full: wait for its oldest message to age out.
    const oldest = this.sentAt[0] as number;
    return Math.max(gapWait, oldest + this.limit.windowMs - now);
  }

  /** Records a message as sent at this moment. */
  record(now: number): void {
    this.forget(now);
    this.sentAt.push(now);
  }

  /** Drops the messages that have aged out of the window. */
  private forget(now: number): void {
    const cutoff = now - this.limit.windowMs;

    while (this.sentAt.length > 0 && (this.sentAt[0] as number) <= cutoff) {
      this.sentAt.shift();
    }
  }
}

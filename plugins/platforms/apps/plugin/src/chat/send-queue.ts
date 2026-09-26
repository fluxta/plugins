import { RateLimiter, type RateLimit } from "./rate-limiter";

/**
 * Serialises sends for one account, spacing them to stay inside Twitch's chat
 * limits.
 *
 * The queue exists so a burst of Events does not silently lose messages. It is
 * FIFO with no cap: dropping a message the user asked to send would be worse
 * than sending it late.
 */
export class SendQueue {
  private readonly limiter: RateLimiter;
  private readonly waiting: (() => void)[] = [];
  private draining = false;

  constructor(limit: RateLimit) {
    this.limiter = new RateLimiter(limit);
  }

  /**
   * Runs `send` when the rate limit allows, resolving with its result.
   *
   * Rejections propagate to the caller, and never stall the queue for anyone
   * behind them.
   */
  enqueue(send: () => Promise<void>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.waiting.push(() => {
        send().then(resolve, reject);
      });

      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.draining) {
      return;
    }

    this.draining = true;

    try {
      while (this.waiting.length > 0) {
        const wait = this.limiter.delayBefore(Date.now());

        if (wait > 0) {
          await sleep(wait);
        }

        const next = this.waiting.shift();

        if (next) {
          this.limiter.record(Date.now());
          next();
        }
      }
    } finally {
      this.draining = false;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

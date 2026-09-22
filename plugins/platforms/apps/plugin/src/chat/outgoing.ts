/**
 * Remembers what the plugin itself said in chat, so those messages do not come
 * back as Events.
 *
 * Without this, the obvious first scenario — an Event on Chat Message whose
 * Action sends a chat message — is an infinite loop.
 *
 * Matching is by sender and text rather than by message id, because the
 * EventSub notification can arrive before the send's HTTP response does. The
 * text is known before sending, so there is no race.
 */
export class OutgoingMessages {
  private readonly pending: { userId: string; text: string; at: number }[] = [];

  /**
   * @param ttlMs How long an unmatched entry lingers. It only has to outlast
   * the round trip from sending to seeing the message come back.
   */
  constructor(private readonly ttlMs = 15_000) {}

  /** Records a message about to be sent. */
  remember(userId: string, text: string, now = Date.now()): void {
    this.forget(now);
    this.pending.push({ userId, text, at: now });
  }

  /**
   * Reports whether this incoming message is one the plugin sent, consuming
   * the record if so. Consuming matters: sending the same text twice must
   * suppress exactly two incoming messages, not every one that follows.
   */
  claim(userId: string, text: string, now = Date.now()): boolean {
    this.forget(now);

    const index = this.pending.findIndex(
      (entry) => entry.userId === userId && entry.text === text,
    );

    if (index === -1) {
      return false;
    }

    this.pending.splice(index, 1);
    return true;
  }

  /**
   * Drops a record whose send failed, so it cannot go on to suppress a real
   * message from that account.
   */
  discard(userId: string, text: string, now = Date.now()): void {
    this.claim(userId, text, now);
  }

  private forget(now: number): void {
    const cutoff = now - this.ttlMs;

    for (let i = this.pending.length - 1; i >= 0; i--) {
      if ((this.pending[i] as { at: number }).at <= cutoff) {
        this.pending.splice(i, 1);
      }
    }
  }
}

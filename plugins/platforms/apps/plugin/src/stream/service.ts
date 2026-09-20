import { explainTwitchError } from "../twitch/errors";

import type { StreamsApi } from "./api";

/**
 * How often to re-read the viewer count while the channel is live.
 *
 * There is no push for a changing viewer count, so this is the one thing
 * this service actually polls Twitch for — and only while a stream is live,
 * since a viewer count nobody can see is not worth reading.
 */
const POLL_INTERVAL_MS = 60_000;

type StreamState =
  | { status: "idle" }
  | { status: "offline" }
  | { status: "live"; viewerCount: number };

/**
 * Tracks whether the Channel is live and how many viewers it has, for the
 * `is-live` and `viewer-count` Value Sources, the Is Live Changed and Viewer
 * Count Changed Events, and the Get Live Status and Get Viewer Count Actions.
 *
 * Live and offline are learned from EventSub — `wentLive` and `wentOffline`,
 * pushed by `EventSubService` — so both flip the moment Twitch says so, with
 * no polling at all while the channel is offline. Going live sets the viewer
 * count to zero rather than reading it immediately: reading right away would
 * race Twitch's own systems, which can briefly still report the stream as
 * offline the instant after the "went live" push. The regular poll fills the
 * real number in within `POLL_INTERVAL_MS`.
 *
 * A single missed transition (a socket reconnect landing at exactly the
 * wrong instant) can leave this briefly stale until the next real one
 * arrives, or until the next poll notices the channel is not live after all.
 * That is accepted rather than polling while offline just to guard against
 * it — twurple already reconnects the socket on its own.
 */
export class StreamStatusService {
  private state: StreamState = { status: "idle" };
  /** The channel the current state belongs to. */
  private tracked?: string;
  private poll?: NodeJS.Timeout;
  private readonly liveListeners = new Set<(isLive: boolean) => void>();
  private readonly viewerCountListeners = new Set<(viewerCount: number) => void>();

  constructor(
    private readonly channelId: () => string | undefined,
    private readonly api: StreamsApi,
  ) {}

  /** Whether the Channel is live, or nothing while no Broadcaster Account is connected. */
  isLive(): boolean | undefined {
    return this.state.status === "idle" ? undefined : this.state.status === "live";
  }

  /** Current viewers, or nothing while not live — a count nobody would read. */
  viewerCount(): number | undefined {
    return this.state.status === "live" ? this.state.viewerCount : undefined;
  }

  /**
   * Notified whenever `isLive()` settles on a new, known answer — never for
   * losing the Broadcaster Account, which leaves nothing definite to report.
   */
  onLiveChange(listener: (isLive: boolean) => void): () => void {
    this.liveListeners.add(listener);
    return () => this.liveListeners.delete(listener);
  }

  /**
   * Notified whenever `viewerCount()` settles on a new, known number — never
   * for going offline or losing the Broadcaster Account, which leave nothing
   * to report.
   */
  onViewerCountChange(listener: (viewerCount: number) => void): () => void {
    this.viewerCountListeners.add(listener);
    return () => this.viewerCountListeners.delete(listener);
  }

  /**
   * Brings tracking in line with the connected Accounts. Safe to call on
   * every Account change — it does nothing when the broadcaster has not
   * changed.
   */
  async sync(): Promise<void> {
    const channelId = this.channelId();

    if (channelId === this.tracked) {
      return;
    }

    this.tracked = channelId;
    this.stopPolling();

    if (!channelId) {
      this.set({ status: "idle" });
      return;
    }

    // Seeds the state for a channel that was already live when the plugin
    // started — EventSub only reports transitions from here on.
    await this.refresh(channelId);
  }

  /** Twitch reported the channel going live. */
  wentLive(): void {
    const channelId = this.channelId();

    if (!channelId) {
      return;
    }

    this.set({ status: "live", viewerCount: 0 });
    this.startPolling(channelId);
  }

  /** Twitch reported the channel going offline. */
  wentOffline(): void {
    this.stopPolling();
    this.set({ status: "offline" });
  }

  private async refresh(channelId: string): Promise<void> {
    try {
      const stream = await this.api.getStreamByUserId(channelId);

      if (stream) {
        this.set({ status: "live", viewerCount: stream.viewers });
        this.startPolling(channelId);
      } else {
        this.stopPolling();
        this.set({ status: "offline" });
      }
    } catch (error) {
      // A transient read failure keeps whatever was last known rather than
      // flipping the tile to "no data" over one bad request.
      console.error(`The channel's live status could not be read: ${explainTwitchError(error)}`);
    }
  }

  private startPolling(channelId: string): void {
    if (this.poll) {
      return;
    }

    const timer = setInterval(() => void this.refresh(channelId), POLL_INTERVAL_MS);
    // A pending poll must not be what keeps the process alive.
    timer.unref();
    this.poll = timer;
  }

  private stopPolling(): void {
    if (this.poll) {
      clearInterval(this.poll);
      this.poll = undefined;
    }
  }

  /**
   * Replaces the state and notifies each dimension that actually changed.
   *
   * The two Events this feeds are independent — a poll that only confirms
   * the viewer count did not move must not fire Is Live Changed, and going
   * live must fire Viewer Count Changed too, since the count really did just
   * change (to zero, until the next poll fills in the real number) — so each
   * is compared to its own prior answer rather than diffing the state as a
   * whole.
   */
  private set(state: StreamState): void {
    const wasLive = this.isLive();
    const wasViewerCount = this.viewerCount();

    this.state = state;

    const isLive = this.isLive();

    if (isLive !== undefined && isLive !== wasLive) {
      for (const listener of this.liveListeners) {
        listener(isLive);
      }
    }

    const viewerCount = this.viewerCount();

    if (viewerCount !== undefined && viewerCount !== wasViewerCount) {
      for (const listener of this.viewerCountListeners) {
        listener(viewerCount);
      }
    }
  }
}

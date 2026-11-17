import Centrifuge from "centrifuge";

import type { ChannelToken } from "../donationalerts/api";

const CENTRIFUGO_URL =
  "wss://centrifugo.donationalerts.com/connection/websocket";

/**
 * Asked for the tokens of private channels whenever the client subscribes —
 * after every reconnect too, since each has a new client id. `respond` with a
 * non-200 `status` fails the subscription, which the client then reports.
 */
export type PrivateSubscribe = (
  ctx: { data: { client: string; channels: string[] } },
  respond: (response: {
    status: number;
    data: { channels: ChannelToken[] };
  }) => void,
) => void;

export type SubscriptionHandlers = {
  /** `seq`/`gen` or `offset`: where the publication sits in the channel. */
  publish(ctx: {
    data: unknown;
    seq?: number;
    gen?: number;
    offset?: number;
  }): void;
  subscribe(ctx: { isResubscribe: boolean; recovered: boolean }): void;
  error(ctx: { message: string }): void;
};

export interface RealtimeSubscription {
  /** Tries again after an error; a subscription is otherwise kept by the client. */
  subscribe(): void;
}

/**
 * The slice of centrifuge-js the Realtime Connection uses. Its real client
 * satisfies it as is, so everything above it is tested against a fake.
 */
export interface RealtimeClient {
  setToken(token: string): void;
  connect(): void;
  disconnect(): void;
  on(
    event: "disconnect",
    listener: (ctx: { reason: string; reconnect: boolean }) => void,
  ): unknown;
  subscribe(
    channel: string,
    handlers: SubscriptionHandlers,
  ): RealtimeSubscription;
}

/**
 * A centrifuge-js 2.x client for DonationAlerts' Centrifugo, which speaks
 * protocol v2 — the reason `centrifuge` is pinned to 2.8.5.
 *
 * The transport is Node's own WebSocket (stable since Node 22.4; Fluxta's
 * bundled Node is 22.17), so there is no `ws` to bundle.
 */
export function createCentrifugeClient(
  onPrivateSubscribe: PrivateSubscribe,
): RealtimeClient {
  class RealtimeWebSocket extends globalThis.WebSocket {
    override get onmessage(): WebSocket["onmessage"] {
      return super.onmessage;
    }

    override set onmessage(listener: WebSocket["onmessage"]) {
      super.onmessage =
        listener === null
          ? null
          : (event) => {
              try {
                listener.call(this, event);
              } catch (error) {
                if (!(error instanceof SyntaxError)) throw error;

                // centrifuge-js 2.x lets JSON decoding errors escape its
                // message handler; Node's EventTarget then kills the sidecar.
                // Stop this transport before closing it so queued messages
                // cannot reach the decoder while the close is in flight.
                this.onmessage = null;
                const data: unknown = event.data;
                const length = typeof data === "string" ? data.length : 0;
                // JSON.parse errors can quote tokens or Donation contents.
                console.warn(
                  `An invalid realtime message was skipped (type: ${typeof data}, length: ${length}); reconnecting`,
                );
                // An application close code is allowed by Node's WebSocket;
                // centrifuge-js handles onclose with its normal reconnect.
                this.close(4000, "Invalid realtime message");
              }
            };
    }
  }

  return new Centrifuge(CENTRIFUGO_URL, {
    websocket: RealtimeWebSocket,
    // centrifuge-js waits min × 2^(step + 1), less up to half at random:
    // 1 s growing to 60 s, the curve of `retryDelay`.
    minRetry: 500,
    maxRetry: 60_000,
    onPrivateSubscribe,
  });
}

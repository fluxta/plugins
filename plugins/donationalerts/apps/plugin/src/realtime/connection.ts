import type { RealtimeState } from "donationalerts-protocol";

import { Unauthorized, type DonationAlertsApi } from "../donationalerts/api";
import type { ChannelPosition } from "../donations/feed";
import type { Schedule } from "../schedule";
import type { PrivateSubscribe, RealtimeClient } from "./client";
import { retryDelay } from "./retry";

/** What the Realtime Connection needs of the signed-in Account. */
export type RealtimeAccount = { id: number; accessToken: string };

export type RealtimeConnectionDeps = {
  api: Pick<DonationAlertsApi, "getUser" | "subscribeChannels">;
  createClient(onPrivateSubscribe: PrivateSubscribe): RealtimeClient;
  schedule: Schedule;
  random?: () => number;
  /**
   * A publication on the Account's donation channel, as Centrifugo sent it —
   * live, or replayed from its history on resubscribe.
   */
  onDonation(data: unknown, position: ChannelPosition): void;
  /**
   * The donation channel is subscribed: on start, and again after every
   * drop — just before the history Centrifugo replays is handed on.
   */
  onDonationsSubscribed(account: RealtimeAccount): void;
  /** A publication on the Account's goal channel, as Centrifugo sent it. */
  onGoal(data: unknown): void;
  /**
   * DonationAlerts refused the Account's token. The connection is already
   * down and retries nothing; only a new Sign-in brings it back.
   */
  onUnauthorized(): void;
  /** Called whenever what `state()` returns may have changed. */
  onChange(): void;
};

export function donationChannel(accountId: number): string {
  return `$alerts:donation_${accountId}`;
}

export function goalChannel(accountId: number): string {
  return `$goals:goal_${accountId}`;
}

/** What is retried, each on its own curve so one cannot cancel another. */
type RetryKey = "start" | "donations" | "goals";

/**
 * The plugin's one link to DonationAlerts' Centrifugo, for the signed-in
 * Account: its donation channel and its goal channel.
 *
 * Dropping is normal and is retried without end: centrifuge-js reconnects and
 * resubscribes on its own (each time with a new client id, so new channel
 * tokens through `onPrivateSubscribe`); what it does not retry — fetching the
 * socket token, a refused subscription, a server that will not take the
 * client back — is retried here on the same curve. Only DonationAlerts
 * refusing the Account's token stops it, and the Account is then
 * Reauthorization Required.
 *
 * The state follows the donation channel alone: Donations are what the
 * plugin is for, so a goal channel that fails to subscribe is retried and
 * logged without calling the connection down.
 */
export class RealtimeConnection {
  private account: RealtimeAccount | undefined;
  private client: RealtimeClient | undefined;
  private current: RealtimeState | undefined;
  /** Bumped on every teardown, so callbacks of an abandoned client are ignored. */
  private generation = 0;
  private attempts = new Map<RetryKey, number>();
  private pendingRetries = new Map<RetryKey, () => void>();

  constructor(private readonly deps: RealtimeConnectionDeps) {}

  state(): RealtimeState | undefined {
    return this.current;
  }

  /**
   * Keeps the connection on the given Account: starts for a new one or a new
   * token, stops when there is none, and leaves a running one alone.
   */
  follow(account: RealtimeAccount | undefined): void {
    if (
      account?.id === this.account?.id &&
      account?.accessToken === this.account?.accessToken
    ) {
      return;
    }

    this.teardown();
    this.account = account;
    this.attempts.clear();

    if (!account) {
      this.set(undefined);
      return;
    }

    this.set({ status: "connecting" });
    void this.start(account);
  }

  private async start(account: RealtimeAccount): Promise<void> {
    const generation = this.generation;
    const live = () => generation === this.generation;

    let socketToken: string;

    try {
      // Fetched afresh for every client: it is never persisted.
      socketToken = (await this.deps.api.getUser(account.accessToken))
        .socketConnectionToken;
    } catch (error) {
      if (live()) {
        this.fail(error, () => void this.start(account));
      }
      return;
    }

    if (!live()) {
      return;
    }

    const client = this.deps.createClient((ctx, respond) => {
      this.deps.api.subscribeChannels(account.accessToken, ctx.data).then(
        (channels) => respond({ status: 200, data: { channels } }),
        (error: unknown) => {
          if (live() && error instanceof Unauthorized) {
            this.fail(error, () => {});
            return;
          }
          // Answered as a failure, which the client reports as each
          // subscription's error — retried there.
          respond({ status: 503, data: { channels: [] } });
        },
      );
    });
    this.client = client;

    client.on("disconnect", ({ reason, reconnect }) => {
      if (!live()) {
        return;
      }

      if (reconnect) {
        this.set({ status: "reconnecting", reason });
        return;
      }

      // The server will not take this client back — its socket token may
      // have gone stale. Start over with a fresh one.
      this.teardown();
      this.retry("start", reason, () => void this.start(account));
    });

    const donations = client.subscribe(donationChannel(account.id), {
      publish: ({ data, seq, gen, offset }) => {
        if (live()) {
          this.deps.onDonation(data, { seq, gen, offset });
        }
      },
      subscribe: () => {
        if (live()) {
          // Only a working subscription proves the whole chain, so only it
          // brings the waits back to 1 s.
          this.attempts.delete("start");
          this.attempts.delete("donations");
          this.set({ status: "connected" });
          // centrifuge-js reports the subscription and then, in the same
          // turn, hands on the history it replayed; Catch-up's list arrives
          // only after that, so it finds those already fired.
          this.deps.onDonationsSubscribed(account);
        }
      },
      error: ({ message }) => {
        if (live()) {
          this.retry("donations", message, () => donations.subscribe());
        }
      },
    });

    const goals = client.subscribe(goalChannel(account.id), {
      publish: ({ data }) => {
        if (live()) {
          this.deps.onGoal(data);
        }
      },
      subscribe: () => {
        if (live()) {
          this.attempts.delete("goals");
        }
      },
      error: ({ message }) => {
        if (live()) {
          console.warn(`Goal updates are not coming in (${message}); retrying`);
          this.retry("goals", message, () => goals.subscribe(), {
            report: false,
          });
        }
      },
    });

    client.setToken(socketToken);
    client.connect();
  }

  private fail(error: unknown, retry: () => void): void {
    if (error instanceof Unauthorized) {
      // Waiting will not fix it: stop until the Account signs in again. The
      // Account remembers it is Reauthorization Required, so a restart does
      // not try the token again either.
      this.teardown();
      this.set(undefined);
      this.deps.onUnauthorized();
      return;
    }

    this.retry(
      "start",
      error instanceof Error ? error.message : String(error),
      retry,
    );
  }

  private retry(
    key: RetryKey,
    reason: string,
    again: () => void,
    { report = true }: { report?: boolean } = {},
  ): void {
    if (report) {
      this.set({ status: "reconnecting", reason });
    }

    this.pendingRetries.get(key)?.();

    const attempt = this.attempts.get(key) ?? 0;
    this.attempts.set(key, attempt + 1);

    const generation = this.generation;
    this.pendingRetries.set(
      key,
      this.deps.schedule(retryDelay(attempt, this.deps.random), () => {
        this.pendingRetries.delete(key);
        if (generation === this.generation) {
          again();
        }
      }),
    );
  }

  private teardown(): void {
    this.generation++;
    for (const cancel of this.pendingRetries.values()) {
      cancel();
    }
    this.pendingRetries.clear();
    this.client?.disconnect();
    this.client = undefined;
  }

  private set(state: RealtimeState | undefined): void {
    this.current = state;
    this.deps.onChange();
  }
}

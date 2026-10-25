import { describe, expect, it, vi } from "vitest";

import { Unauthorized, type DonationAlertsApi } from "../donationalerts/api";
import type {
  PrivateSubscribe,
  RealtimeClient,
  SubscriptionHandlers,
} from "./client";
import { donationChannel, goalChannel, RealtimeConnection } from "./connection";

const ACCOUNT = { id: 10111687, accessToken: "access-token" };
const CHANNEL = donationChannel(ACCOUNT.id);
const GOALS = goalChannel(ACCOUNT.id);

/** A centrifuge-js client that does only what the test makes it do. */
class FakeClient implements RealtimeClient {
  token: string | undefined;
  connected = false;
  disconnected = false;
  handlers = new Map<string, SubscriptionHandlers>();
  resubscribes = new Map<string, number>();
  private onDisconnect: (ctx: { reason: string; reconnect: boolean }) => void =
    () => {};

  constructor(readonly authorize: PrivateSubscribe) {}

  setToken(token: string) {
    this.token = token;
  }
  connect() {
    this.connected = true;
  }
  disconnect() {
    this.disconnected = true;
  }
  on(
    _event: "disconnect",
    listener: (ctx: { reason: string; reconnect: boolean }) => void,
  ) {
    this.onDisconnect = listener;
  }
  subscribe(channel: string, handlers: SubscriptionHandlers) {
    this.handlers.set(channel, handlers);
    return {
      subscribe: () =>
        void this.resubscribes.set(
          channel,
          (this.resubscribes.get(channel) ?? 0) + 1,
        ),
    };
  }

  /** What centrifuge-js does on connecting: ask for the channel tokens. */
  askForTokens(client: string) {
    return new Promise<{ status: number; data: unknown }>((resolve) =>
      this.authorize({ data: { client, channels: [CHANNEL, GOALS] } }, resolve),
    );
  }
  drop(reason: string, reconnect: boolean) {
    this.onDisconnect({ reason, reconnect });
  }
  channel(name = CHANNEL) {
    return this.handlers.get(name)!;
  }
}

function manualTimers() {
  const pending: { run: () => void; ms: number }[] = [];
  return {
    pending,
    schedule(ms: number, run: () => void) {
      const timer = { run, ms };
      pending.push(timer);
      return () => {
        const index = pending.indexOf(timer);
        if (index !== -1) pending.splice(index, 1);
      };
    },
    runNext() {
      pending.shift()?.run();
    },
  };
}

function setup() {
  const clients: FakeClient[] = [];
  const timers = manualTimers();
  const api = {
    getUser: vi.fn<DonationAlertsApi["getUser"]>(async () => ({
      id: ACCOUNT.id,
      name: "MikeRime",
      avatar: "",
      socketConnectionToken: "socket-token",
    })),
    subscribeChannels: vi.fn<DonationAlertsApi["subscribeChannels"]>(
      async (_token, { channels }) =>
        channels.map((channel) => ({ channel, token: `token-for-${channel}` })),
    ),
  };
  const onDonation = vi.fn();
  const onGoal = vi.fn();
  const onDonationsSubscribed = vi.fn();
  const onUnauthorized = vi.fn();
  const connection = new RealtimeConnection({
    api,
    createClient: (authorize) => {
      const client = new FakeClient(authorize);
      clients.push(client);
      return client;
    },
    schedule: timers.schedule,
    random: () => 0,
    onDonation,
    onGoal,
    onDonationsSubscribed,
    onUnauthorized,
    onChange: () => {},
  });
  return {
    connection,
    clients,
    timers,
    api,
    onDonation,
    onGoal,
    onDonationsSubscribed,
    onUnauthorized,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("RealtimeConnection", () => {
  it("connects with a fresh socket token and subscribes the donation channel", async () => {
    const { connection, clients, api } = setup();
    connection.follow(ACCOUNT);
    expect(connection.state()).toEqual({ status: "connecting" });
    await settle();

    expect(api.getUser).toHaveBeenCalledWith("access-token");
    const [client] = clients;
    expect(client?.token).toBe("socket-token");
    expect(client?.connected).toBe(true);
    expect([...client!.handlers.keys()]).toEqual([
      "$alerts:donation_10111687",
      "$goals:goal_10111687",
    ]);
  });

  it("answers the private subscribe with this client's channel tokens", async () => {
    const { connection, clients, api } = setup();
    connection.follow(ACCOUNT);
    await settle();

    const response = await clients[0]!.askForTokens("client-1");

    expect(api.subscribeChannels).toHaveBeenCalledWith("access-token", {
      client: "client-1",
      channels: [CHANNEL, GOALS],
    });
    expect(response).toEqual({
      status: 200,
      data: {
        channels: [
          { channel: CHANNEL, token: `token-for-${CHANNEL}` },
          { channel: GOALS, token: `token-for-${GOALS}` },
        ],
      },
    });
  });

  it("is connected once subscribed, and hands on every publication", async () => {
    const { connection, clients, onDonation } = setup();
    connection.follow(ACCOUNT);
    await settle();
    const channel = clients[0]!.channel();

    channel.subscribe({ isResubscribe: false, recovered: false });
    expect(connection.state()).toEqual({ status: "connected" });

    channel.publish({ data: { id: 1 }, seq: 9 });
    expect(onDonation).toHaveBeenCalledWith(
      { id: 1 },
      { seq: 9, gen: undefined, offset: undefined },
    );
  });

  it("reports a drop and comes back when centrifuge-js resubscribes", async () => {
    const { connection, clients, api } = setup();
    connection.follow(ACCOUNT);
    await settle();
    const client = clients[0]!;
    client.channel().subscribe({ isResubscribe: false, recovered: false });

    client.drop("insufficient state", true);
    expect(connection.state()).toEqual({
      status: "reconnecting",
      reason: "insufficient state",
    });

    // A reconnect is a new client id, so new channel tokens.
    await client.askForTokens("client-2");
    expect(api.subscribeChannels).toHaveBeenLastCalledWith("access-token", {
      client: "client-2",
      channels: [CHANNEL, GOALS],
    });
    client.channel().subscribe({ isResubscribe: true, recovered: true });
    expect(connection.state()).toEqual({ status: "connected" });
  });

  it("retries fetching the socket token until DonationAlerts answers", async () => {
    const { connection, clients, timers, api } = setup();
    api.getUser.mockRejectedValueOnce(new Error("DonationAlerts answered 502"));
    connection.follow(ACCOUNT);
    await settle();

    expect(connection.state()).toEqual({
      status: "reconnecting",
      reason: "DonationAlerts answered 502",
    });
    expect(clients).toHaveLength(0);
    expect(timers.pending[0]?.ms).toBe(1_000);

    timers.runNext();
    await settle();
    expect(clients).toHaveLength(1);
  });

  it("starts over with a fresh socket token when the server will not take the client back", async () => {
    const { connection, clients, timers, api } = setup();
    connection.follow(ACCOUNT);
    await settle();

    clients[0]!.drop("invalid token", false);
    expect(clients[0]!.disconnected).toBe(true);
    expect(connection.state()).toMatchObject({ status: "reconnecting" });

    timers.runNext();
    await settle();
    expect(api.getUser).toHaveBeenCalledTimes(2);
    expect(clients).toHaveLength(2);
  });

  it("retries a refused subscription", async () => {
    const { connection, clients, timers, api } = setup();
    api.subscribeChannels.mockRejectedValueOnce(new Error("answered 500"));
    connection.follow(ACCOUNT);
    await settle();
    const client = clients[0]!;

    expect(await client.askForTokens("client-1")).toMatchObject({
      status: 503,
    });
    client.channel().error({ message: "authorization request failed" });
    expect(connection.state()).toEqual({
      status: "reconnecting",
      reason: "authorization request failed",
    });

    timers.runNext();
    expect(client.resubscribes.get(CHANNEL)).toBe(1);
  });

  it("says so every time the donation channel is subscribed", async () => {
    const { connection, clients, onDonationsSubscribed } = setup();
    connection.follow(ACCOUNT);
    await settle();
    const client = clients[0]!;

    client.channel().subscribe({ isResubscribe: false, recovered: false });
    client.drop("insufficient state", true);
    client.channel().subscribe({ isResubscribe: true, recovered: true });
    client.channel(GOALS).subscribe({ isResubscribe: true, recovered: true });

    expect(onDonationsSubscribed).toHaveBeenCalledTimes(2);
    expect(onDonationsSubscribed).toHaveBeenLastCalledWith(ACCOUNT);
  });

  it("hands on goal publications", async () => {
    const { connection, clients, onDonation, onGoal } = setup();
    connection.follow(ACCOUNT);
    await settle();

    clients[0]!.channel(GOALS).publish({ data: { id: 7 } });

    expect(onGoal).toHaveBeenCalledWith({ id: 7 });
    expect(onDonation).not.toHaveBeenCalled();
  });

  it("retries a goal channel without calling the connection down", async () => {
    const { connection, clients, timers } = setup();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    connection.follow(ACCOUNT);
    await settle();
    const client = clients[0]!;
    client.channel().subscribe({ isResubscribe: false, recovered: false });

    client.channel(GOALS).error({ message: "permission denied" });

    expect(connection.state()).toEqual({ status: "connected" });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("permission denied"),
    );
    timers.runNext();
    expect(client.resubscribes.get(GOALS)).toBe(1);
  });

  it("keeps a donation retry and a goal retry apart", async () => {
    const { connection, clients, timers } = setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    connection.follow(ACCOUNT);
    await settle();
    const client = clients[0]!;

    client.channel().error({ message: "authorization request failed" });
    client.channel(GOALS).error({ message: "authorization request failed" });
    expect(timers.pending).toHaveLength(2);

    timers.runNext();
    timers.runNext();
    expect(client.resubscribes.get(CHANNEL)).toBe(1);
    expect(client.resubscribes.get(GOALS)).toBe(1);
  });

  it("does not reset its waits until the donation channel works", async () => {
    const { connection, clients, timers } = setup();
    connection.follow(ACCOUNT);
    await settle();

    clients[0]!.drop("invalid token", false);
    expect(timers.pending[0]?.ms).toBe(1_000);
    timers.runNext();
    await settle();

    clients[1]!.drop("invalid token", false);
    expect(timers.pending[0]?.ms).toBe(2_000);
  });

  it("stops for good and says so when DonationAlerts refuses the token", async () => {
    const { connection, clients, timers, api, onUnauthorized } = setup();
    api.getUser.mockRejectedValueOnce(new Unauthorized());
    connection.follow(ACCOUNT);
    await settle();

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(connection.state()).toBeUndefined();
    expect(timers.pending).toHaveLength(0);
    expect(clients).toHaveLength(0);

    // The same Account again is not a reason to retry; a new token is.
    connection.follow(ACCOUNT);
    expect(connection.state()).toBeUndefined();
    connection.follow({ ...ACCOUNT, accessToken: "new-token" });
    expect(connection.state()).toEqual({ status: "connecting" });
  });

  it("stops when a channel token is refused for the token", async () => {
    const { connection, clients, api, onUnauthorized } = setup();
    api.subscribeChannels.mockRejectedValueOnce(new Unauthorized());
    connection.follow(ACCOUNT);
    await settle();

    void clients[0]!.askForTokens("client-1");
    await settle();

    expect(clients[0]!.disconnected).toBe(true);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(connection.state()).toBeUndefined();
  });

  it("disconnects on sign out and ignores the old client afterwards", async () => {
    const { connection, clients, onDonation } = setup();
    connection.follow(ACCOUNT);
    await settle();
    const client = clients[0]!;

    connection.follow(undefined);
    expect(client.disconnected).toBe(true);
    expect(connection.state()).toBeUndefined();

    client.channel().subscribe({ isResubscribe: false, recovered: false });
    client.channel().publish({ data: { id: 1 } });
    expect(connection.state()).toBeUndefined();
    expect(onDonation).not.toHaveBeenCalled();
  });

  it("leaves a running connection alone for the same Account", async () => {
    const { connection, clients } = setup();
    connection.follow(ACCOUNT);
    await settle();

    connection.follow({ ...ACCOUNT });
    await settle();

    expect(clients).toHaveLength(1);
    expect(clients[0]!.disconnected).toBe(false);
  });
});

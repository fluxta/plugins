import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DonationAlertsApi,
  DonationAlertsUser,
} from "../donationalerts/api";
import { LOOPBACK_PORT, SIGN_IN_TIMEOUT_MS } from "../donationalerts/config";
import {
  PortInUse,
  type Loopback,
  type SignInAnswer,
} from "../donationalerts/loopback";
import { AccountService, MAX_TIMER_MS } from "./service";
import { AccountStore } from "./store";

const USER: DonationAlertsUser = {
  id: 10111687,
  name: "MikeRime",
  avatar: "https://example.com/avatar.png",
  socketConnectionToken: "socket-token",
};
const IDENTITY = { id: USER.id, name: USER.name, avatar: USER.avatar };
const NOW = 1_760_000_000_000;

/** A loopback whose browser answer the test hands in. */
function fakeLoopback() {
  let answer: (result: SignInAnswer) => void = () => {};
  const loopback: Loopback & { closed: boolean } = {
    port: LOOPBACK_PORT,
    answer: new Promise((resolve) => (answer = resolve)),
    closed: false,
    close() {
      loopback.closed = true;
    },
  };
  return { loopback, answer: (result: SignInAnswer) => answer(result) };
}

/** A clock that only moves when the test says so. */
function manualTimers() {
  const pending: { at: number; run: () => void }[] = [];
  let now = 0;
  return {
    schedule(ms: number, run: () => void) {
      const timer = { at: now + ms, run };
      pending.push(timer);
      return () => pending.splice(pending.indexOf(timer), 1);
    },
    advance(ms: number) {
      now += ms;
      for (const timer of pending.filter((t) => t.at <= now)) {
        pending.splice(pending.indexOf(timer), 1);
        timer.run();
      }
    },
  };
}

function setup(options: { openLoopback?: () => Promise<Loopback> } = {}) {
  const fake = fakeLoopback();
  const timers = manualTimers();
  const store = new AccountStore({ setPluginSettings: async () => {} });
  const api: DonationAlertsApi = {
    getUser: vi.fn(async () => USER),
    subscribeChannels: vi.fn(async () => []),
    listDonations: vi.fn(async () => []),
  };
  const openLoopback = vi.fn<
    (options: { port: number; state: string }) => Promise<Loopback>
  >(options.openLoopback ?? (async () => fake.loopback));
  const openBrowser = vi.fn();
  const onChange = vi.fn();
  const service = new AccountService({
    store,
    api,
    openLoopback,
    openBrowser,
    now: () => NOW,
    schedule: timers.schedule,
    onChange,
  });
  return { service, store, api, fake, timers, openLoopback, openBrowser };
}

/** Lets the Sign-in reach its next await. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("AccountService", () => {
  it("starts signed out", () => {
    expect(setup().service.state()).toEqual({ status: "signed-out" });
  });

  it("signs in through the browser and stores the Account", async () => {
    const { service, store, fake, openLoopback, openBrowser } = setup();
    const done = service.startSignIn();
    await settle();

    expect(openLoopback).toHaveBeenCalledWith({
      port: LOOPBACK_PORT,
      state: expect.stringMatching(/^[0-9a-f]{32}$/),
    });
    const state = openLoopback.mock.calls[0]![0].state;
    const url = new URL(openBrowser.mock.calls[0]![0] as string);
    expect(url.searchParams.get("state")).toBe(state);
    expect(url.searchParams.get("response_type")).toBe("token");
    expect(service.state()).toEqual({
      status: "signing-in",
      authorizeUrl: url.toString(),
    });

    fake.answer({ kind: "token", accessToken: "tok", expiresIn: 31536000 });
    await done;

    expect(fake.loopback.closed).toBe(true);
    expect(store.get()).toEqual({
      ...IDENTITY,
      accessToken: "tok",
      expiresAt: NOW + 31536000 * 1000,
    });
    expect(service.state()).toEqual({
      status: "signed-in",
      name: "MikeRime",
      avatar: USER.avatar,
      expiresAt: NOW + 31536000 * 1000,
    });
  });

  it("gives up after five minutes without an answer", async () => {
    const { service, store, fake, timers } = setup();
    const done = service.startSignIn();
    await settle();

    timers.advance(SIGN_IN_TIMEOUT_MS - 1);
    expect(service.state().status).toBe("signing-in");

    timers.advance(1);
    await done;

    expect(fake.loopback.closed).toBe(true);
    expect(store.get()).toBeUndefined();
    expect(service.state()).toEqual({
      status: "signed-out",
      problem: expect.stringContaining("5 minutes"),
    });
  });

  it("cancels without complaint", async () => {
    const { service, fake } = setup();
    const done = service.startSignIn();
    await settle();

    service.cancelSignIn();
    await done;

    expect(fake.loopback.closed).toBe(true);
    expect(service.state()).toEqual({ status: "signed-out" });
  });

  it("names the port another program holds", async () => {
    const { service, openBrowser } = setup({
      openLoopback: async () => {
        throw new PortInUse(LOOPBACK_PORT);
      },
    });
    await service.startSignIn();

    expect(openBrowser).not.toHaveBeenCalled();
    expect(service.state()).toEqual({
      status: "signed-out",
      problem: expect.stringContaining(`Port ${LOOPBACK_PORT}`),
    });
  });

  it("reports a refusal of access", async () => {
    const { service, fake } = setup();
    const done = service.startSignIn();
    await settle();

    fake.answer({ kind: "denied", reason: "access_denied" });
    await done;

    expect(service.state()).toEqual({
      status: "signed-out",
      problem: expect.stringContaining("access_denied"),
    });
  });

  it("stores nothing when the account cannot be read", async () => {
    const { service, store, api, fake } = setup();
    vi.mocked(api.getUser).mockRejectedValueOnce(
      new Error("DonationAlerts answered 503"),
    );
    const done = service.startSignIn();
    await settle();

    fake.answer({ kind: "token", accessToken: "tok", expiresIn: 60 });
    await done;

    expect(store.get()).toBeUndefined();
    expect(service.state()).toEqual({
      status: "signed-out",
      problem: expect.stringContaining("503"),
    });
  });

  it("reopens the browser when Sign in is pressed again while waiting", async () => {
    const { service, openLoopback, openBrowser } = setup();
    void service.startSignIn();
    await settle();

    await service.startSignIn();

    expect(openLoopback).toHaveBeenCalledTimes(1);
    expect(openBrowser).toHaveBeenCalledTimes(2);
    expect(openBrowser.mock.calls[1]).toEqual(openBrowser.mock.calls[0]);
  });

  it("replaces the Account on a new Sign-in", async () => {
    const { service, store, fake } = setup();
    await store.save({ ...IDENTITY, accessToken: "old", expiresAt: 1 });
    const done = service.startSignIn();
    await settle();

    fake.answer({ kind: "token", accessToken: "new", expiresIn: 60 });
    await done;

    expect(store.get()?.accessToken).toBe("new");
  });

  it("forgets the Account on Sign out", async () => {
    const { service, store } = setup();
    await store.save({ ...IDENTITY, accessToken: "tok", expiresAt: 1 });

    await service.signOut();

    expect(store.get()).toBeUndefined();
    expect(service.state()).toEqual({ status: "signed-out" });
  });
});

/** A clock that moves only when the test says so, and runs what falls due. */
function virtualClock(start: number) {
  const pending: { at: number; ms: number; run: () => void }[] = [];
  const clock = {
    now: start,
    pending,
    schedule(ms: number, run: () => void) {
      const timer = { at: clock.now + ms, ms, run };
      pending.push(timer);
      return () => {
        const index = pending.indexOf(timer);
        if (index !== -1) pending.splice(index, 1);
      };
    },
    async advance(ms: number) {
      clock.now += ms;
      for (const timer of pending.filter((t) => t.at <= clock.now)) {
        pending.splice(pending.indexOf(timer), 1);
        timer.run();
      }
      await settle();
    },
  };
  return clock;
}

function expirySetup(expiresAt: number) {
  const clock = virtualClock(NOW);
  const store = new AccountStore({ setPluginSettings: async () => {} });
  const api: DonationAlertsApi = {
    getUser: vi.fn(async () => USER),
    subscribeChannels: vi.fn(async () => []),
    listDonations: vi.fn(async () => []),
  };
  const onChange = vi.fn();
  const fake = fakeLoopback();
  const service = new AccountService({
    store,
    api,
    openLoopback: async () => fake.loopback,
    openBrowser: () => {},
    now: () => clock.now,
    schedule: clock.schedule,
    onChange,
  });
  store.hydrate({
    account: { ...IDENTITY, accessToken: "tok", expiresAt },
  });
  return { service, store, api, clock, onChange, fake };
}

const HOUR = 60 * 60 * 1000;

describe("Sign-in Expiry and Reauthorization Required", () => {
  it("drops a token whose expiry passed while Fluxta was closed, asking nobody", async () => {
    const { service, store, api, onChange } = expirySetup(NOW - 1);

    await service.reconcile();

    expect(store.get()?.accessToken).toBeUndefined();
    expect(service.state()).toEqual({
      status: "reauthorization-required",
      name: USER.name,
      avatar: USER.avatar,
      reason: "expired",
      expiresAt: NOW - 1,
    });
    expect(api.getUser).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalled();
  });

  it("drops the token when the expiry passes while running", async () => {
    const { service, store, clock } = expirySetup(NOW + HOUR);
    await service.reconcile();

    await clock.advance(HOUR - 1);
    expect(service.state().status).toBe("signed-in");

    await clock.advance(1);
    expect(store.get()?.accessToken).toBeUndefined();
    expect(service.state()).toMatchObject({
      status: "reauthorization-required",
      reason: "expired",
    });
  });

  it("waits a year in steps a timer can hold", async () => {
    const YEAR = 31_536_000_000;
    const { service, clock } = expirySetup(NOW + YEAR);
    await service.reconcile();

    expect(clock.pending.map((timer) => timer.ms)).toEqual([MAX_TIMER_MS]);
    await clock.advance(MAX_TIMER_MS);
    expect(service.state().status).toBe("signed-in");
    expect(clock.pending).toHaveLength(1);

    await clock.advance(YEAR - MAX_TIMER_MS);
    expect(service.state()).toMatchObject({ reason: "expired" });
  });

  it("keeps a single expiry wait however often it reconciles", async () => {
    const { service, clock } = expirySetup(NOW + HOUR);

    await service.reconcile();
    await service.reconcile();

    expect(clock.pending).toHaveLength(1);
  });

  it("is Reauthorization Required, refused, when DonationAlerts refuses the token", async () => {
    const { service, store, clock } = expirySetup(NOW + HOUR);
    await service.reconcile();

    await service.refused();

    expect(store.get()).toEqual({ ...IDENTITY, expiresAt: NOW + HOUR });
    expect(service.state()).toMatchObject({
      status: "reauthorization-required",
      reason: "refused",
    });
    expect(clock.pending).toHaveLength(0);
  });

  it("comes back with a new Sign-in", async () => {
    const { service, store, fake } = expirySetup(NOW + HOUR);
    await service.refused();

    const done = service.startSignIn();
    await settle();
    fake.answer({ kind: "token", accessToken: "new", expiresIn: 60 });
    await done;

    expect(store.get()?.accessToken).toBe("new");
    expect(service.state().status).toBe("signed-in");
  });

  it("stops waiting for the expiry on Sign out", async () => {
    const { service, clock } = expirySetup(NOW + HOUR);
    await service.reconcile();

    await service.signOut();

    expect(clock.pending).toHaveLength(0);
  });
});

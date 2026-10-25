import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ListedDonation } from "../donationalerts/api";
import { DonationFeed, LATE_DELIVERY_MS, type Delivery } from "./feed";

const ACCOUNT = { id: 10111687, accessToken: "access-token" };

function donation(id: number) {
  return { id, username: "Mike", amount: 100, currency: "RUB" };
}

function listed(...ids: number[]): ListedDonation[] {
  // Newest first, as DonationAlerts lists them.
  return [...ids]
    .sort((a, b) => b - a)
    .map((id) => ({ id, data: donation(id) }));
}

function setup(firstPage: ListedDonation[] = []) {
  const clock = { now: 1_000_000 };
  const fired: { id: number; delivery: Delivery }[] = [];
  const api = {
    listDonations: vi.fn(async () => firstPage),
  };
  const feed = new DonationFeed({
    api,
    fire: (data, delivery) =>
      fired.push({ id: (data as { id: number }).id, delivery }),
    now: () => clock.now,
  });
  return {
    feed,
    api,
    clock,
    fired,
    ids: () => fired.map((entry) => entry.id),
  };
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("DonationFeed", () => {
  it("fires nothing for Donations listed when it starts listening", async () => {
    const { feed, fired } = setup(listed(1, 2, 3));

    await feed.subscribed(ACCOUNT);

    expect(fired).toEqual([]);
  });

  it("fires each live publication", () => {
    const { feed, fired } = setup();

    feed.publication(donation(10), { seq: 9 });
    feed.publication(donation(11), { seq: 10 });

    expect(fired).toEqual([
      { id: 10, delivery: "live" },
      { id: 11, delivery: "live" },
    ]);
  });

  it("skips a publication replayed from history at the position it had", () => {
    const { feed, ids } = setup();

    feed.publication(donation(10), { seq: 9 });
    feed.publication(donation(10), { seq: 9 });

    expect(ids()).toEqual([10]);
  });

  it("fires a repeat — the same Donation at a new position — again", () => {
    const { feed, ids } = setup();

    feed.publication(donation(10), { seq: 9 });
    feed.publication(donation(10), { seq: 10 });

    expect(ids()).toEqual([10, 10]);
  });

  it("does not take a new Donation for seen when the server numbers anew", () => {
    const { feed, ids } = setup();

    feed.publication(donation(10), { seq: 1 });
    feed.publication(donation(11), { seq: 1 });

    expect(ids()).toEqual([10, 11]);
  });

  it("fires every publication that carries no position", () => {
    const { feed, ids } = setup();

    feed.publication(donation(10), {});
    feed.publication(donation(10), {});

    expect(ids()).toEqual([10, 10]);
  });

  it("catches up on Donations missed during a drop, oldest first", async () => {
    const { feed, api, fired } = setup(listed(1, 2));
    await feed.subscribed(ACCOUNT);
    feed.publication(donation(3), { seq: 9 });

    api.listDonations.mockResolvedValueOnce(listed(1, 2, 3, 4, 5));
    await feed.subscribed(ACCOUNT);

    expect(fired).toEqual([
      { id: 3, delivery: "live" },
      { id: 4, delivery: "catch-up" },
      { id: 5, delivery: "catch-up" },
    ]);
  });

  it("fires a Donation once when history and Catch-up both bring it", async () => {
    const { feed, api, ids } = setup(listed(1));
    await feed.subscribed(ACCOUNT);

    // As centrifuge-js does it: the subscription is reported, the replayed
    // history follows in the same turn, the list arrives after.
    api.listDonations.mockResolvedValueOnce(listed(1, 2, 3));
    const caughtUp = feed.subscribed(ACCOUNT);
    feed.publication(donation(2), { seq: 9 });
    await caughtUp;

    expect(ids()).toEqual([2, 3]);
  });

  it("skips the late live publication of a caught-up Donation, but not a later repeat", async () => {
    const { feed, api, ids } = setup(listed(1));
    await feed.subscribed(ACCOUNT);
    api.listDonations.mockResolvedValueOnce(listed(1, 2));
    await feed.subscribed(ACCOUNT);

    feed.publication(donation(2), { seq: 9 });
    feed.publication(donation(2), { seq: 10 });

    expect(ids()).toEqual([2, 2]);
  });

  it("fires a repeat of a caught-up Donation once the late delivery could no longer come", async () => {
    const { feed, api, clock, ids } = setup(listed(1));
    await feed.subscribed(ACCOUNT);
    api.listDonations.mockResolvedValueOnce(listed(1, 2));
    await feed.subscribed(ACCOUNT);

    clock.now += LATE_DELIVERY_MS;
    feed.publication(donation(2), { seq: 30 });

    expect(ids()).toEqual([2, 2]);
  });

  it("never catches up on a repeat: the list has one entry per Donation", async () => {
    const { feed, api, ids } = setup(listed(1));
    await feed.subscribed(ACCOUNT);
    feed.publication(donation(2), { seq: 9 });

    api.listDonations.mockResolvedValueOnce(listed(1, 2));
    await feed.subscribed(ACCOUNT);

    expect(ids()).toEqual([2]);
  });

  it("logs a failed list and catches up on the next resubscribe", async () => {
    const { feed, api, ids } = setup(listed(1));
    await feed.subscribed(ACCOUNT);

    api.listDonations.mockRejectedValueOnce(
      new Error("DonationAlerts answered 502"),
    );
    await feed.subscribed(ACCOUNT);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("DonationAlerts answered 502"),
    );
    expect(ids()).toEqual([]);

    api.listDonations.mockResolvedValueOnce(listed(1, 2));
    await feed.subscribed(ACCOUNT);
    expect(ids()).toEqual([2]);
  });

  it("starts afresh for another Account", async () => {
    const { feed, api, ids } = setup(listed(1));
    await feed.subscribed(ACCOUNT);
    feed.publication(donation(5), { seq: 9 });

    api.listDonations.mockResolvedValueOnce(listed(7, 8));
    await feed.subscribed({ id: 42, accessToken: "other" });

    expect(ids()).toEqual([5]);
  });
});

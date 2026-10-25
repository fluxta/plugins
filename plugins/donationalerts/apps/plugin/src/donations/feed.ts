import type { DonationAlertsApi } from "../donationalerts/api";

/**
 * Where a publication sits in its Centrifugo channel. DonationAlerts'
 * Centrifugo (an older v2) sends `seq`, and `gen` once `seq` wraps; newer
 * servers send `offset`. Absent when the server keeps no history.
 */
export type ChannelPosition = { seq?: number; gen?: number; offset?: number };

/** How a Donation reached the plugin. */
export type Delivery = "live" | "catch-up";

/**
 * How long after Catch-up fired a Donation its own live publication can still
 * turn up — the Donation was made while the list was on its way. Live
 * delivery and the list were under a second apart in the spike; anything
 * later is a repeat the streamer asked for.
 */
export const LATE_DELIVERY_MS = 30_000;

export type DonationFeedDeps = {
  api: Pick<DonationAlertsApi, "listDonations">;
  /** Fires Donation Received for a Donation as DonationAlerts sent it. */
  fire(data: unknown, delivery: Delivery): void;
  now?: () => number;
};

/**
 * Turns everything that brings a Donation in — the donation channel, the
 * history Centrifugo replays on resubscribe, Catch-up — into one Donation
 * Received per publication.
 *
 * A publication is known by its Donation's id together with its position in
 * the channel. Centrifugo's history replays a publication with the position
 * it had, so a replay is skipped; DonationAlerts' "repeat alert" publishes
 * the same Donation at a new position, so a repeat fires, as the streamer
 * asked. The id is part of the key so that a server that loses its history
 * and starts numbering anew cannot make a new Donation look seen.
 *
 * Catch-up fires only Donations not fired at all in this run: the list has
 * one entry per Donation, however often it was published.
 */
export class DonationFeed {
  private accountId: number | undefined;
  /** The newest Donation id known in this run; Catch-up fires what is newer. */
  private newestId: number | undefined;
  private publications = new Set<string>();
  private firedIds = new Set<number>();
  /**
   * When Catch-up fired each Donation. Its live publication may still be on
   * its way — the Donation was made while the list was being fetched — and a
   * first publication within `LATE_DELIVERY_MS` is that late delivery, not a
   * repeat, so it is skipped.
   */
  private caughtUp = new Map<number, number>();

  constructor(private readonly deps: DonationFeedDeps) {}

  /** A publication on the donation channel, live or replayed from history. */
  publication(data: unknown, position: ChannelPosition): void {
    const id = donationId(data);

    if (id === undefined) {
      // Not a Donation the plugin can key; the mapping decides what it is.
      this.deps.fire(data, "live");
      return;
    }

    const key = positionKey(id, position);

    if (key !== undefined) {
      if (this.publications.has(key)) {
        return;
      }
      this.publications.add(key);
    }

    const caughtUpAt = this.caughtUp.get(id);

    if (caughtUpAt !== undefined) {
      this.caughtUp.delete(id);
      if (this.now() - caughtUpAt < LATE_DELIVERY_MS) {
        return;
      }
    }

    this.remember(id);
    this.deps.fire(data, "live");
  }

  /**
   * The donation channel is subscribed — on start, or again after a drop.
   *
   * The first time for an Account it only notes the newest listed id, so
   * that Donations made before the plugin was listening — while Fluxta was
   * closed — never fire. Every later time it is Catch-up.
   */
  async subscribed(account: {
    id: number;
    accessToken: string;
  }): Promise<void> {
    if (account.id !== this.accountId) {
      this.reset(account.id);
    }

    let listed;

    try {
      listed = await this.deps.api.listDonations(account.accessToken);
    } catch (error) {
      // The boundary stays where it was, so the next resubscribe catches
      // up on these as well.
      console.warn(
        `Could not check for missed donations: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    if (account.id !== this.accountId) {
      return;
    }

    if (this.newestId === undefined) {
      this.newestId = Math.max(0, ...listed.map((entry) => entry.id));
      return;
    }

    const boundary = this.newestId;
    const missed = listed
      .filter((entry) => entry.id > boundary && !this.firedIds.has(entry.id))
      .sort((a, b) => a.id - b.id);

    for (const entry of missed) {
      // Checked again: another Catch-up or a live publication may have fired
      // it while this list was on its way.
      if (this.firedIds.has(entry.id)) {
        continue;
      }
      this.remember(entry.id);
      this.caughtUp.set(entry.id, this.now());
      this.deps.fire(entry.data, "catch-up");
    }

    if (missed.length > 0) {
      console.log(
        `Caught up on ${missed.length} donation(s) missed while reconnecting`,
      );
    }
  }

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  private remember(id: number): void {
    this.firedIds.add(id);
    this.newestId = Math.max(this.newestId ?? id, id);
  }

  private reset(accountId: number): void {
    this.accountId = accountId;
    this.newestId = undefined;
    this.publications.clear();
    this.firedIds.clear();
    this.caughtUp.clear();
  }
}

function donationId(data: unknown): number | undefined {
  const id = (data as { id?: unknown } | null)?.id;
  const number = typeof id === "string" ? Number(id) : id;
  return typeof number === "number" && Number.isInteger(number)
    ? number
    : undefined;
}

/**
 * Without a position there is no history to replay either, so a publication
 * without one is simply new.
 */
function positionKey(
  id: number,
  { seq, gen, offset }: ChannelPosition,
): string | undefined {
  if (offset !== undefined) {
    return `${id}@o${offset}`;
  }
  if (seq !== undefined) {
    return `${id}@${gen ?? 0}:${seq}`;
  }
  return undefined;
}

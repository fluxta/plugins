import {
  RECENT_EVENTS_LIMIT,
  type DonationReceivedFields,
  type GoalUpdatedFields,
  type RecentEvent,
} from "donationalerts-protocol";

/**
 * The last Events the plugin fired in this run, newest first, for the Plugin
 * Editor — so a streamer can tell "the plugin never got it" from "the Event
 * Filter did not let it through".
 *
 * Memory only: a restart starts it empty. It is the one place donor names
 * and messages are kept, and they go to the editor, never to the log.
 */
export class RecentEvents {
  private entries: RecentEvent[] = [];

  constructor(
    private readonly now: () => number = Date.now,
    private readonly limit: number = RECENT_EVENTS_LIMIT,
  ) {}

  donation(
    fields: DonationReceivedFields,
    delivery: "live" | "catch-up" | "test",
  ): void {
    this.add({ kind: "donation", at: this.now(), delivery, fields });
  }

  goal(fields: GoalUpdatedFields): void {
    this.add({ kind: "goal", at: this.now(), fields });
  }

  list(): RecentEvent[] {
    return this.entries;
  }

  private add(entry: RecentEvent): void {
    this.entries = [entry, ...this.entries].slice(0, this.limit);
  }
}

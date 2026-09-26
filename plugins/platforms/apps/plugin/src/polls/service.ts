import { explainTwitchError } from "../twitch/errors";

import type { PollsApi } from "./api";
import { toCreatePollData, type PollDraft, type PollSource } from "./poll";

const NO_BROADCASTER = "Connect the broadcaster account to run polls.";

/**
 * Starts and ends the Channel's Poll.
 *
 * Holds no state of its own. Twitch allows at most one active Poll per
 * Channel, so "is one running, and which" is answered by asking Twitch fresh
 * every time rather than caching an answer — one that would go stale the
 * moment a Poll is touched from the Twitch dashboard, and one a plugin
 * restart would otherwise have to reconstruct. Asking fresh means there is
 * never anything cached to lose.
 */
export class PollsService {
  constructor(
    private readonly channelId: () => string | undefined,
    private readonly api: PollsApi,
  ) {}

  /** @returns the id of the Poll that started, or nothing when it did not. */
  async start(draft: PollDraft): Promise<string | undefined> {
    const channelId = this.channelId();

    if (!channelId) {
      console.error(NO_BROADCASTER);
      return undefined;
    }

    const active = await this.active(channelId);

    if (active) {
      console.error(
        `Start Poll did not start "${draft.title}": the poll "${active.title}" is still ` +
          "running. Twitch allows only one at a time — end it before starting another.",
      );
      return undefined;
    }

    try {
      const created = await this.api.createPoll(channelId, toCreatePollData(draft));
      console.log(`Started the poll "${created.title}"`);
      return created.id;
    } catch (error) {
      console.error(`The poll "${draft.title}" was not started: ${explainTwitchError(error)}`);
      return undefined;
    }
  }

  /** Ends whichever Poll is currently running. Does nothing, loudly, when none is. */
  async end(): Promise<void> {
    const channelId = this.channelId();

    if (!channelId) {
      console.error(NO_BROADCASTER);
      return;
    }

    const active = await this.active(channelId);

    if (!active) {
      console.warn("End Poll ran with no poll currently running");
      return;
    }

    try {
      await this.api.endPoll(channelId, active.id);
      console.log(`Ended the poll "${active.title}"`);
    } catch (error) {
      console.error(`The poll "${active.title}" was not ended: ${explainTwitchError(error)}`);
    }
  }

  /** The Channel's currently active Poll, if it has one. */
  private async active(channelId: string): Promise<PollSource | undefined> {
    try {
      const { data } = await this.api.getPolls(channelId);
      return data.find((poll) => poll.status === "ACTIVE");
    } catch (error) {
      console.error(`The channel's polls could not be read: ${explainTwitchError(error)}`);
      return undefined;
    }
  }
}

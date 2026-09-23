import type { CommercialLength } from "platforms-protocol";

import { explainTwitchError } from "../twitch/errors";

import type { ChannelApi, ChannelInfoUpdate } from "./api";

const NO_BROADCASTER = "Connect the broadcaster account to control the channel.";

/** What an Update Stream Info call asks to change. Nothing asked for is nothing sent. */
export type ChannelInfoChange = {
  title?: string;
  /** The category's exact Twitch name — looked up for its id before the write. */
  category?: string;
  tags?: string[];
};

/**
 * Changes the Channel's own stream info, and starts, cancels or runs the
 * things Twitch only lets the Channel itself do: raiding another channel and
 * running a commercial break.
 *
 * Holds no state of its own — there is nothing to cache that Twitch does not
 * already answer in one call.
 */
export class ChannelService {
  constructor(
    private readonly channelId: () => string | undefined,
    private readonly api: ChannelApi,
  ) {}

  /** Changes the Channel's title, category and/or Tags. */
  async updateInfo(change: ChannelInfoChange): Promise<void> {
    const channelId = this.channelId();

    if (!channelId) {
      console.error(NO_BROADCASTER);
      return;
    }

    const data: ChannelInfoUpdate = {};

    if (change.title !== undefined) {
      data.title = change.title;
    }

    if (change.tags !== undefined) {
      data.tags = change.tags;
    }

    if (change.category !== undefined) {
      let game;

      try {
        game = await this.api.getGameByName(change.category);
      } catch (error) {
        console.error(
          `Could not look up the Twitch category "${change.category}": ${explainTwitchError(error)}`,
        );
        return;
      }

      if (!game) {
        console.error(`Update Stream Info did not run: no Twitch category is named "${change.category}"`);
        return;
      }

      data.gameId = game.id;
    }

    if (Object.keys(data).length === 0) {
      console.warn("Update Stream Info ran with nothing to change");
      return;
    }

    try {
      await this.api.updateChannelInfo(channelId, data);
      console.log("Updated the channel's stream info");
    } catch (error) {
      console.error(`The channel's stream info was not updated: ${explainTwitchError(error)}`);
    }
  }

  /** Starts a raid from the Channel to another one. */
  async startRaid(login: string): Promise<void> {
    const channelId = this.channelId();

    if (!channelId) {
      console.error(NO_BROADCASTER);
      return;
    }

    let target;

    try {
      target = await this.api.getUserByName(login);
    } catch (error) {
      console.error(`Could not look up the Twitch channel "${login}": ${explainTwitchError(error)}`);
      return;
    }

    if (!target) {
      console.error(`Start Raid did not run: no Twitch channel is named "${login}"`);
      return;
    }

    try {
      await this.api.startRaid(channelId, target.id);
      console.log(`Started a raid to "${target.displayName}"`);
    } catch (error) {
      console.error(`The raid to "${target.displayName}" was not started: ${explainTwitchError(error)}`);
    }
  }

  /**
   * Cancels a raid this Channel started.
   *
   * There is no endpoint to ask Twitch whether a raid is running, so unlike
   * ending a Poll or a Prediction, this cannot check first — Twitch's own
   * refusal is the only way to learn one was not.
   */
  async cancelRaid(): Promise<void> {
    const channelId = this.channelId();

    if (!channelId) {
      console.error(NO_BROADCASTER);
      return;
    }

    try {
      await this.api.cancelRaid(channelId);
      console.log("Cancelled the raid");
    } catch (error) {
      console.error(`The raid was not cancelled: ${explainTwitchError(error)}`);
    }
  }

  /** Runs a commercial break on the Channel. */
  async runCommercial(length: CommercialLength): Promise<void> {
    const channelId = this.channelId();

    if (!channelId) {
      console.error(NO_BROADCASTER);
      return;
    }

    try {
      await this.api.startChannelCommercial(channelId, length);
      console.log(`Ran a ${length}s commercial`);
    } catch (error) {
      console.error(`The commercial was not run: ${explainTwitchError(error)}`);
    }
  }
}

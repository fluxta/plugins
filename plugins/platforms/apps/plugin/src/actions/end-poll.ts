import { StandaloneAction } from "@fluxta/sdk/api";

import type { PollsService } from "../polls/service";

export const END_POLL_ACTION = "twitch-end-poll";

/**
 * Ends the Channel's running Poll early.
 *
 * Takes no settings: Twitch allows at most one active Poll per Channel, so
 * there is nothing to pick — the plugin asks Twitch which one is running and
 * ends that one. Running with none active does nothing beyond a log line.
 *
 * Standalone: it acts on the channel, not on the deck Item that triggered it.
 */
export class EndPollAction extends StandaloneAction {
  type = END_POLL_ACTION;

  constructor(private readonly polls: PollsService) {
    super();
  }

  onTrigger = async (): Promise<void> => {
    await this.polls.end();
  };
}

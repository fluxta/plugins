import type { HelixCreatePollData } from "@twurple/api";

import type { PollSource } from "./poll";

/**
 * The parts of twurple's polls API the plugin uses.
 *
 * Narrowed to an own type so everything built on it can be exercised without a
 * live `ApiClient`, which only a connected Account can produce. twurple's own
 * Polls satisfy `PollSource`, so the real client fits without an adapter.
 */
export interface PollsApi {
  getPolls(broadcaster: string): Promise<{ data: PollSource[] }>;
  createPoll(broadcaster: string, data: HelixCreatePollData): Promise<PollSource>;
  endPoll(broadcaster: string, id: string): Promise<PollSource>;
}

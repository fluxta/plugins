import type { Source } from "@fluxta/sdk/api";

import type { SongQueue } from "../songs/song-queue";

/** Requests Open is read afresh, including after a host reconnect. */
export function createRequestsSource(queue: SongQueue): Source {
  return { key: "requestsOpen", resolve: () => queue.requestsOpen };
}

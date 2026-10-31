import type { Source } from "@fluxta/sdk/api";

import type { SongQueue } from "../songs/song-queue";

/** Each query reads local state afresh, including after a host reconnect. */
export function createPlaybackSources(queue: SongQueue): Source[] {
  const keys = [
    "isPlaying",
    "isPaused",
    "playerConnected",
    "currentTitle",
    "currentRequester",
    "isFallback",
    "queueLength",
    "queueDuration",
    "volume",
  ] as const;
  return keys.map((key) => ({ key, resolve: () => queue.status()[key] }));
}

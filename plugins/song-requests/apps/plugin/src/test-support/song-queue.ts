import {
  FALLBACK_RULE_DEFAULTS,
  type BlocklistEntry,
} from "song-requests-protocol";

import { toSongDroppedPayload, toSongEndedPayload } from "../events";
import { SongQueue } from "../songs/song-queue";
import type { Track } from "../songs/provider";
import { fakeProvider, FakePlayer } from "./fake-provider";

/** Actions run against the real Song Queue; only Providers and Players are fakes. */
export function songQueue(trackDetails: Partial<Track> = {}) {
  const { provider, player } = fakeProvider(
    "fake",
    new FakePlayer(),
    trackDetails,
  );
  const other = fakeProvider("other");
  const dropped: ReturnType<typeof toSongDroppedPayload>[] = [];
  const ended: ReturnType<typeof toSongEndedPayload>[] = [];
  const blocklist: BlocklistEntry[] = [];
  let id = 0;
  const queue = new SongQueue({
    providers: [provider, other.provider],
    newId: () => `song-${++id}`,
    rules: {
      defaults: () => FALLBACK_RULE_DEFAULTS,
      blocklist: () => blocklist,
    },
    onBlock: (entry) => {
      blocklist.push(entry);
      return true;
    },
    onDropped: (song, why) => dropped.push(toSongDroppedPayload(song, why)),
    onEnded: (song, how) => ended.push(toSongEndedPayload(song, how)),
  });
  const request = (
    title: string,
    requesterId = "42",
    position: "inTurn" | "next" = "inTurn",
    requesterPlatform = "twitch",
  ) =>
    queue.request(
      title,
      {
        requesterId,
        requesterPlatform,
        requesterName: "Viewer",
        reference: "redemption",
      },
      { position },
    );
  return { queue, player, other, request, dropped, ended, blocklist };
}

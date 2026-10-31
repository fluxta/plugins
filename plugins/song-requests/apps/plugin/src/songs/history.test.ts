import { describe, expect, it } from "vitest";

import type { Song } from "./provider";
import {
  HISTORY_LIMIT,
  HISTORY_MAX_AGE_MS,
  recordInHistory,
  trimHistory,
} from "./history";

function entry(
  at: number,
  id = "song-1",
): { song: Song; how: "finished" | "failed"; at: number } {
  return {
    song: {
      provider: "fake",
      trackId: id,
      title: "One",
      channel: "Fake channel",
      channelUrl: "fake://channel",
      url: `fake://${id}`,
      requesterPlatform: "twitch",
      requesterId: "u1",
      requesterName: "viewer",
      reference: "",
      id,
    },
    how: "finished",
    at,
  };
}

describe("the History's trimming", () => {
  it("keeps the newest 200", () => {
    const now = 2_000_000;
    // Newest first, the way the History keeps it.
    const history = Array.from({ length: HISTORY_LIMIT + 20 }, (_, i) =>
      entry(now - i, `song-${i}`),
    );

    const trimmed = trimHistory(history, now);

    expect(trimmed).toHaveLength(HISTORY_LIMIT);
    expect(trimmed[0].song.id).toBe("song-0");
    expect(trimmed.at(-1)?.song.id).toBe(`song-${HISTORY_LIMIT - 1}`);
  });

  it("drops what is older than 30 days", () => {
    const now = 1_760_000_000_000;
    const history = [
      entry(now, "new"),
      entry(now - HISTORY_MAX_AGE_MS, "edge"),
      entry(now - HISTORY_MAX_AGE_MS - 1, "old"),
    ];

    expect(trimHistory(history, now).map(({ song }) => song.id)).toEqual([
      "new",
      "edge",
    ]);
  });

  it("puts a new entry first and trims against its own time", () => {
    const now = 1_760_000_000_000;
    const history = [
      entry(now - HISTORY_MAX_AGE_MS - 1, "old"),
      entry(now - 1000, "recent"),
    ];

    const recorded = recordInHistory(history, entry(now, "newest"));

    expect(recorded.map(({ song }) => song.id)).toEqual(["newest", "recent"]);
  });
});

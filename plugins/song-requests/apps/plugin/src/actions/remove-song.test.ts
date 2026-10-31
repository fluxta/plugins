import { StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { RemoveSongSettings } from "song-requests-protocol";
import { describe, expect, it } from "vitest";

import { songQueue } from "../test-support/song-queue";
import { RemoveSongAction } from "./remove-song";

describe("Remove Song", () => {
  it("removes a Requester's latest arrival even when Next changed its position", async () => {
    const { queue, request, dropped } = songQueue();
    await request("fake:older@100");
    await request("fake:latest@100", "42", "next");
    const action = new RemoveSongAction(queue);
    expect(
      action.onTrigger(
        new StandaloneTriggerContext("remove", {
          target: "requesterLatest",
          requesterPlatform: "twitch",
          requesterId: "42",
        }),
      ),
    ).toEqual({ removed: 1, title: "latest" });
    expect(queue.snapshot().waiting.map((song) => song.title)).toEqual([
      "older",
    ]);
    expect(dropped).toMatchObject([
      {
        songId: "song-2",
        why: "removed",
        reference: "redemption",
        requesterId: "42",
      },
    ]);
  });
  it.each([
    [
      { target: "requesterAll", requesterPlatform: "twitch", requesterId: 42 },
      ["first", "second"],
      ["other-platform", "other-id"],
    ],
    [
      { target: "position", position: 2 },
      ["second"],
      ["first", "other-platform", "other-id"],
    ],
    [
      { target: "songId", songId: "song-1" },
      ["first"],
      ["second", "other-platform", "other-id"],
    ],
  ])(
    "removes the selected waiting Songs and reports each removal: %j",
    async (settings, removed, waiting) => {
      const { queue, request, dropped } = songQueue();
      await request("fake:first@100");
      await request("fake:second@100");
      await request("fake:other-platform@100", "42", "inTurn", "kick");
      await request("other:other-id@100", "99");
      const result = new RemoveSongAction(queue).onTrigger(
        new StandaloneTriggerContext("remove", settings as RemoveSongSettings),
      );
      expect(result).toEqual({ removed: removed.length, title: removed[0] });
      expect(dropped.map((song) => [song.title, song.why])).toEqual(
        removed.map((title) => [title, "removed"]),
      );
      expect(queue.snapshot().waiting.map((song) => song.title)).toEqual(
        waiting,
      );
    },
  );

  it.each([
    {},
    { target: "requesterAll", requesterId: "" },
    { target: "position", position: "0" },
    { target: "position", position: "1.5" },
    { target: "position", position: "NaN" },
    { target: "songId", songId: "missing" },
  ])(
    "leaves the Current Song and unrelated Songs alone for a missing target: %j",
    async (settings) => {
      const { queue, player, request, dropped, ended } = songQueue();
      player.connect();
      await request("fake:current@100");
      player.load();
      await request("fake:waiting@100");
      expect(
        new RemoveSongAction(queue).onTrigger(
          new StandaloneTriggerContext(
            "remove",
            settings as RemoveSongSettings,
          ),
        ),
      ).toEqual({ removed: 0 });
      expect(queue.snapshot().current?.song.title).toBe("current");
      expect(queue.snapshot().waiting).toHaveLength(1);
      expect(dropped).toEqual([]);
      expect(ended).toEqual([]);
    },
  );
  it("starts the next Provider when removing a waiting head whose Player is disconnected", async () => {
    const { queue, other, request } = songQueue();
    await request("fake:unavailable@100");
    await request("other:ready@100");
    other.player.connect();
    expect(other.player.played).toEqual([]);
    expect(
      new RemoveSongAction(queue).onTrigger(
        new StandaloneTriggerContext("remove", {
          target: "position",
          position: "1",
        }),
      ),
    ).toEqual({ removed: 1, title: "unavailable" });
    expect(other.player.played.at(-1)?.song.title).toBe("ready");
    expect(queue.snapshot().waiting).toEqual([]);
  });
});

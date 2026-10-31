import { StandaloneTriggerContext } from "@fluxta/sdk/api";
import { describe, expect, it } from "vitest";

import { songQueue } from "../test-support/song-queue";
import { ClearQueueAction } from "./clear-queue";

describe("Clear Queue", () => {
  it("drops every waiting Song with cleared and leaves the Current Song playing", async () => {
    const { queue, player, request, dropped, ended } = songQueue();
    player.connect();
    await request("fake:current@100");
    player.load();
    await request("fake:first@100");
    await request("other:second@100", "99", "next");
    const action = new ClearQueueAction(queue);
    expect(action.onTrigger(new StandaloneTriggerContext("clear", {}))).toEqual(
      { removed: 2 },
    );
    expect(
      dropped.map((song) => [song.title, song.why, song.reference]),
    ).toEqual([
      ["second", "cleared", "redemption"],
      ["first", "cleared", "redemption"],
    ]);
    expect(queue.snapshot().waiting).toEqual([]);
    expect(queue.status().isPlaying).toBe(true);
    expect(player.stopped).toBe(false);
    expect(ended).toEqual([]);
    expect(action.onTrigger(new StandaloneTriggerContext("clear", {}))).toEqual(
      { removed: 0 },
    );
  });
});

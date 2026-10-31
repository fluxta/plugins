import { StandaloneTriggerContext } from "@fluxta/sdk/api";
import { describe, expect, it } from "vitest";

import { SongQueue } from "../songs/song-queue";
import { fakeProvider } from "../test-support/fake-provider";
import { SkipAction } from "./skip";

describe("Skip", () => {
  it("does nothing when no Song is on air and leaves waiting Songs alone", async () => {
    const { provider, player } = fakeProvider();
    const queue = new SongQueue({ providers: [provider], newId: () => "song" });
    await queue.request("fake:waiting@100");
    expect(
      new SkipAction(queue).onTrigger(new StandaloneTriggerContext("skip", {})),
    ).toEqual({});
    expect(queue.snapshot().waiting).toHaveLength(1);
    expect(player.stopped).toBe(false);
  });

  it("drops a Song still at its Start Check without a Song Ended or History entry", async () => {
    const { provider, player } = fakeProvider();
    const ended: unknown[] = [];
    const dropped: unknown[] = [];
    let id = 0;
    const queue = new SongQueue({
      providers: [provider],
      newId: () => `${++id}`,
      onEnded: (song, how) => ended.push({ title: song.title, how }),
      onDropped: (song, why) => dropped.push({ title: song.title, why }),
    });
    player.connect();
    await queue.request("fake:checking");
    const old = player.played.at(-1)!.song;
    await queue.request("fake:next@100");
    expect(
      new SkipAction(queue).onTrigger(new StandaloneTriggerContext("skip", {})),
    ).toEqual({ title: "checking" });
    player.events?.ended(old.id);
    player.events?.loaded(old.id, 100);
    expect(ended).toEqual([]);
    expect(dropped).toEqual([{ title: "checking", why: "removed" }]);
    expect(queue.snapshot().history).toEqual([]);
    expect(queue.snapshot().current?.song.title).toBe("next");
  });
  it("returns the skipped title, ends it as skipped and puts the next Song on air", async () => {
    const { provider, player } = fakeProvider();
    const ended: unknown[] = [];
    let id = 0;
    const queue = new SongQueue({
      providers: [provider],
      newId: () => `${++id}`,
      onEnded: (song, how) => ended.push({ title: song.title, how }),
    });
    player.connect();
    await queue.request("fake:first@100");
    player.load();
    await queue.request("fake:second@100");

    const action = new SkipAction(queue);
    expect(action.onTrigger(new StandaloneTriggerContext("skip", {}))).toEqual({
      title: "first",
    });
    expect(ended).toEqual([{ title: "first", how: "skipped" }]);
    expect(queue.snapshot().history[0]).toMatchObject({
      song: { title: "first" },
      how: "skipped",
    });
    expect(player.played.at(-1)?.song.title).toBe("second");
  });
});

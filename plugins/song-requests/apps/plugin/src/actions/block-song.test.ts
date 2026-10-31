import { StandaloneTriggerContext } from "@fluxta/sdk/api";
import { describe, expect, it } from "vitest";

import { SongQueue } from "../songs/song-queue";
import { fakeProvider } from "../test-support/fake-provider";
import { songQueue } from "../test-support/song-queue";
import { BlockSongAction } from "./block-song";

describe("Block Song", () => {
  it("blocks a track, drops all waiting copies, skips it on air, and leaves other Providers alone", async () => {
    const { queue, player, request, blocklist, dropped, ended } = songQueue();
    player.connect();
    await request("fake:bad@100");
    player.load();
    await queue.request("fake:bad@100", undefined, {
      overrides: { alreadyQueued: { mode: "off" } },
    });
    await request("other:bad@100");
    await request("fake:good@100");
    expect(
      new BlockSongAction(queue).onTrigger(
        new StandaloneTriggerContext("block", {
          target: "current",
          kind: "track",
        }),
      ),
    ).toEqual({ title: "bad" });
    expect(blocklist).toEqual([
      { kind: "track", provider: "fake", trackId: "bad" },
    ]);
    expect(dropped).toMatchObject([{ title: "bad", why: "blocked" }]);
    expect(ended).toMatchObject([{ title: "bad", how: "skipped" }]);
    expect(queue.snapshot().history[0]).toMatchObject({
      song: { title: "bad" },
      how: "skipped",
    });
    expect(queue.snapshot().waiting.map((song) => song.title)).toEqual([
      "bad",
      "good",
    ]);
    expect(await request("fake:bad@100")).toMatchObject({ kind: "refused" });
  });
  it("blocks a waiting Song's channel by address without an API Key and drops a Start Check unheard", async () => {
    const { queue, player, request, blocklist, dropped, ended } = songQueue();
    player.connect();
    await request("fake:current");
    await request("fake:waiting@100");
    await request("other:safe@100");
    expect(
      new BlockSongAction(queue).onTrigger(
        new StandaloneTriggerContext("block", {
          target: "songId",
          songId: "song-2",
          kind: "channel",
        }),
      ),
    ).toEqual({ title: "waiting" });
    expect(blocklist).toEqual([
      { kind: "channel", provider: "fake", channelUrl: "fake://channel" },
    ]);
    expect(dropped.map((song) => [song.title, song.why])).toEqual([
      ["waiting", "blocked"],
      ["current", "blocked"],
    ]);
    expect(ended).toEqual([]);
    expect(queue.snapshot().history).toEqual([]);
    expect(queue.snapshot().waiting.map((song) => song.title)).toEqual([
      "safe",
    ]);
    expect(await request("fake:new@100")).toEqual({
      kind: "refused",
      reason: "blocked",
    });
  });

  it("stores a Provider channel id when known and drops its waiting Songs", async () => {
    const { queue, request, blocklist, dropped, ended } = songQueue({
      channelId: "stable-channel",
    });
    await request("fake:first@100");
    await request("fake:second@100");
    expect(
      new BlockSongAction(queue).onTrigger(
        new StandaloneTriggerContext("block", {
          target: "songId",
          songId: "song-1",
          kind: "channel",
        }),
      ),
    ).toEqual({ title: "first" });
    expect(blocklist).toEqual([
      {
        kind: "channel",
        provider: "fake",
        channelId: "stable-channel",
        channelUrl: "fake://channel",
      },
    ]);
    expect(dropped.map((song) => song.why)).toEqual(["blocked", "blocked"]);
    expect(ended).toEqual([]);
  });

  it("does nothing when the selected Song is missing", () => {
    const { queue, blocklist, dropped, ended } = songQueue();
    const action = new BlockSongAction(queue);
    expect(action.onTrigger(new StandaloneTriggerContext("block", {}))).toEqual(
      {},
    );
    expect(
      action.onTrigger(
        new StandaloneTriggerContext("block", {
          target: "songId",
          songId: "missing",
        }),
      ),
    ).toEqual({});
    expect(blocklist).toEqual([]);
    expect(dropped).toEqual([]);
    expect(ended).toEqual([]);
  });
  it("leaves restored Songs intact when Plugin settings cannot yet accept a Blocklist entry", async () => {
    const original = songQueue();
    original.player.connect();
    await original.request("fake:current@100");
    original.player.load();
    await original.request("fake:waiting@100");
    const { provider } = fakeProvider();
    const dropped: string[] = [];
    const ended: string[] = [];
    const queue = new SongQueue({
      providers: [provider],
      newId: () => "new",
      initial: original.queue.snapshot(),
      onBlock: () => false,
      onDropped: (song) => dropped.push(song.id),
      onEnded: (song) => ended.push(song.id),
    });
    const before = queue.snapshot();
    expect(
      new BlockSongAction(queue).onTrigger(
        new StandaloneTriggerContext("block", {
          target: "current",
          kind: "channel",
        }),
      ),
    ).toEqual({});
    expect(queue.snapshot()).toEqual(before);
    expect(dropped).toEqual([]);
    expect(ended).toEqual([]);
  });

  it("starts the next Provider after blocking a waiting head whose Player is disconnected", async () => {
    const { queue, other, request, dropped } = songQueue();
    await request("fake:unavailable@100");
    await request("other:ready@100");
    other.player.connect();
    expect(other.player.played).toEqual([]);
    expect(
      new BlockSongAction(queue).onTrigger(
        new StandaloneTriggerContext("block", {
          target: "songId",
          songId: "song-1",
          kind: "track",
        }),
      ),
    ).toEqual({ title: "unavailable" });
    expect(dropped).toMatchObject([{ title: "unavailable", why: "blocked" }]);
    expect(other.player.played.at(-1)?.song.title).toBe("ready");
    expect(queue.snapshot().waiting).toEqual([]);
  });
});

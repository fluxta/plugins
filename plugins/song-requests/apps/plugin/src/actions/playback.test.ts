import { StandaloneTriggerContext } from "@fluxta/sdk/api";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SongQueue } from "../songs/song-queue";
import { fakeProvider } from "../test-support/fake-provider";
import { PlaybackAction } from "./playback";

afterEach(() => vi.useRealTimers());

describe("Playback", () => {
  it("keeps newly requested Songs waiting while paused, then resumes the queue", async () => {
    const { provider, player } = fakeProvider();
    const queue = new SongQueue({ providers: [provider], newId: () => "song" });
    const action = new PlaybackAction(queue);
    expect(
      action.onTrigger(
        new StandaloneTriggerContext("pause", { mode: "pause" }),
      ),
    ).toEqual({ isPaused: true });
    player.connect();
    await queue.request("fake:waiting@100");
    expect(player.played).toEqual([]);
    action.onTrigger(
      new StandaloneTriggerContext("resume", { mode: "resume" }),
    );
    expect(player.played.at(-1)?.song.title).toBe("waiting");
  });
  it("excludes time disconnected from the saved position when the Player comes back", async () => {
    vi.useFakeTimers();
    const { provider, player } = fakeProvider();
    const queue = new SongQueue({ providers: [provider], newId: () => "song" });
    player.connect();
    await queue.request("fake:first@100");
    player.load();
    vi.advanceTimersByTime(12_000);
    player.disconnect();
    vi.advanceTimersByTime(30_000);
    expect(queue.snapshot().current?.position).toBe(12);
    player.connect();
    expect(player.played.at(-1)?.options.startAt).toBe(12);
  });
  it("keeps an explicit pause and position when the Player reconnects", async () => {
    vi.useFakeTimers();
    const { provider, player } = fakeProvider();
    const started: string[] = [];
    const queue = new SongQueue({
      providers: [provider],
      newId: () => "song",
      onStarted: (song) => started.push(song.title),
    });
    player.connect();
    await queue.request("fake:first@100");
    player.load();
    vi.advanceTimersByTime(12_000);
    new PlaybackAction(queue).onTrigger(
      new StandaloneTriggerContext("pause", { mode: "pause" }),
    );
    player.disconnect();
    vi.advanceTimersByTime(30_000);
    player.connect();
    expect(player.played.at(-1)?.options).toMatchObject({
      paused: true,
      startAt: 12,
    });
    expect(queue.snapshot().current?.position).toBe(12);
    expect(started).toEqual(["first"]);
  });
  it("pauses, resumes and toggles without advancing the paused Song or its eta", async () => {
    vi.useFakeTimers();
    const { provider, player } = fakeProvider();
    let id = 0;
    const queue = new SongQueue({
      providers: [provider],
      newId: () => `${++id}`,
    });
    const action = new PlaybackAction(queue);
    const run = (mode: "pause" | "resume" | "toggle") =>
      action.onTrigger(new StandaloneTriggerContext("playback", { mode }));
    player.connect();
    await queue.request("fake:first@100");
    player.load();
    vi.advanceTimersByTime(10_000);

    expect(run("pause")).toEqual({ isPaused: true });
    expect(player.paused).toBe(true);
    vi.advanceTimersByTime(30_000);
    expect(queue.snapshot().current?.position).toBe(10);
    expect(await queue.request("fake:second@100")).toMatchObject({ eta: 90 });
    expect(run("resume")).toEqual({ isPaused: false });
    expect(player.paused).toBe(false);
    vi.advanceTimersByTime(5_000);
    expect(queue.snapshot().current?.position).toBe(15);
    expect(run("toggle")).toEqual({ isPaused: true });
    expect(run("toggle")).toEqual({ isPaused: false });
  });
});

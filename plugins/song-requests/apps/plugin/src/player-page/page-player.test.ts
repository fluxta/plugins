import { afterEach, describe, expect, it, vi } from "vitest";

import {
  KEY_CHANGED_CLOSE_CODE,
  REPLACED_CLOSE_CODE,
} from "song-requests-protocol";

import type { PlayerEvents, Song } from "../songs/provider";
import { SongQueue } from "../songs/song-queue";
import { DataApi } from "../youtube/data-api";
import { fallbackPlaylistTracks } from "../youtube/playlist";
import { PagePlayer, type PageSocket } from "./page-player";

/** One Player Page's socket, as the test drives it. */
class FakeSocket implements PageSocket {
  readonly sent: unknown[] = [];
  closed = false;
  closedWith: number | undefined;
  #onMessage?: (text: string) => void;
  #onClose?: () => void;

  send(text: string) {
    this.sent.push(JSON.parse(text));
  }

  close(code?: number) {
    this.closed = true;
    this.closedWith = code;
    this.#onClose?.();
  }

  onMessage(listener: (text: string) => void) {
    this.#onMessage = listener;
  }

  onClose(listener: () => void) {
    this.#onClose = listener;
  }

  /** The page sends this. */
  says(message: unknown) {
    this.#onMessage?.(
      typeof message === "string" ? message : JSON.stringify(message),
    );
  }
}

/** What the Song Queue hears from the Player. */
function listen(player: PagePlayer) {
  const heard: string[] = [];
  const events: PlayerEvents = {
    playback: (songId, state, position) =>
      heard.push(`playback ${songId} ${state} ${position}`),
    ready: () => heard.push("ready"),
    disconnected: () => heard.push("disconnected"),
    loaded: (songId, duration) => heard.push(`loaded ${songId} ${duration}`),
    ended: (songId) => heard.push(`ended ${songId}`),
    failed: (songId) => heard.push(`failed ${songId}`),
  };
  player.attach(events);
  return heard;
}

const song: Song = {
  id: "song-1",
  provider: "youtube",
  trackId: "dQw4w9WgXcQ",
  title: "Never Gonna Give You Up",
  channel: "Rick Astley",
  channelUrl: "https://www.youtube.com/@RickAstleyYT",
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  requesterPlatform: "",
  requesterId: "",
  requesterName: "",
  reference: "",
};

describe("the Player Page's Player", () => {
  afterEach(() => vi.useRealTimers());
  it("synchronizes Pause and Play during a muted Start Check without counting its position", async () => {
    const player = new PagePlayer();
    const started = vi.fn();
    const queue = new SongQueue({
      providers: [
        {
          id: "youtube",
          player,
          claims: () => true,
          resolve: async () => ({ kind: "track", track: song }),
        },
      ],
      newId: () => "song-1",
      onStarted: started,
    });
    const page = new FakeSocket();
    player.connect(page);
    await queue.request("one");

    page.says({
      event: "playback",
      songId: "song-1",
      state: "paused",
      position: 1.5,
    });
    expect(queue.editorPlayback()).toMatchObject({
      isPaused: true,
      playerState: "paused",
      isPlaying: false,
      current: { position: 0, atStartCheck: true },
    });
    expect(queue.snapshot().isPaused).toBe(true);
    page.says({
      event: "playback",
      songId: "song-1",
      state: "buffering",
      position: 1.5,
    });
    expect(queue.status().isPaused).toBe(true);
    page.says({
      event: "playback",
      songId: "song-1",
      state: "playing",
      position: 1.5,
    });
    expect(queue.editorPlayback()).toMatchObject({
      isPaused: false,
      isPlaying: false,
      current: { position: 0 },
    });
    expect(started).not.toHaveBeenCalled();

    page.says({
      event: "loaded",
      songId: "song-1",
      duration: 200,
      live: false,
    });
    expect(page.sent.at(-1)).toEqual({ event: "unmute", songId: "song-1" });
    expect(started).toHaveBeenCalledTimes(1);
    expect(queue.editorPlayback().current?.position).toBe(0);
  });

  it("starts a restored paused Song when Play comes from the Player, without echoing a command", () => {
    const player = new PagePlayer();
    const started = vi.fn();
    const queue = new SongQueue({
      providers: [
        { id: "youtube", player, claims: () => true, resolve: vi.fn() },
      ],
      newId: () => "unused",
      initial: {
        isPaused: true,
        waiting: [],
        history: [],
        current: {
          song: { ...song, duration: 200 },
          atStartCheck: false,
          started: false,
          position: 0,
        },
      },
      onStarted: started,
    });
    const page = new FakeSocket();
    player.connect(page);
    expect(page.sent.at(-1)).toMatchObject({ event: "load", paused: true });
    page.says({
      event: "loaded",
      songId: "song-1",
      duration: 200,
      live: false,
    });
    expect(started).not.toHaveBeenCalled();
    const commands = page.sent.length;
    page.says({
      event: "playback",
      songId: "song-1",
      state: "playing",
      position: 0,
    });
    expect(queue.editorPlayback()).toMatchObject({
      isPlaying: true,
      isPaused: false,
    });
    page.says({
      event: "playback",
      songId: "song-1",
      state: "playing",
      position: 5,
    });
    expect(started).toHaveBeenCalledTimes(1);
    expect(page.sent).toHaveLength(commands);
  });
  it.each([false, true])(
    "keeps progress in sync with the Player's own pause, resume and buffering (Fallback=%s)",
    async (fallback) => {
      vi.useFakeTimers();
      const player = new PagePlayer();
      const started = vi.fn();
      const queue = new SongQueue({
        providers: [
          {
            id: "youtube",
            player,
            claims: () => true,
            resolve: async () => ({
              kind: "track",
              track: { ...song, duration: 200 },
            }),
          },
        ],
        newId: () => "song-1",
        onStarted: started,
      });
      const page = new FakeSocket();
      player.connect(page);
      if (fallback) queue.setFallbackTracks([{ ...song, duration: 200 }]);
      else await queue.request("one");
      page.says({
        event: "playback",
        songId: "song-1",
        state: "playing",
        position: 100,
      });
      expect(queue.editorPlayback()).toMatchObject({
        isPlaying: false,
        current: { position: 0 },
      });
      page.says({
        event: "loaded",
        songId: "song-1",
        duration: 200,
        live: false,
      });
      vi.advanceTimersByTime(10_000);

      page.says({
        event: "playback",
        songId: "song-1",
        state: "paused",
        position: 10.5,
      });
      vi.advanceTimersByTime(30_000);
      expect(queue.editorPlayback()).toMatchObject({
        isPlaying: false,
        isPaused: true,
        current: { position: 10.5 },
        playerState: "paused",
      });
      expect(queue.snapshot().current?.position).toBe(
        fallback ? undefined : 10.5,
      );

      queue.playback("resume");
      expect(page.sent.at(-1)).toEqual({ event: "resume" });
      expect(queue.editorPlayback().isPlaying).toBe(false);

      page.says({
        event: "playback",
        songId: "song-1",
        state: "playing",
        position: 11,
      });
      vi.advanceTimersByTime(5_000);
      expect(queue.editorPlayback()).toMatchObject({
        isPlaying: true,
        current: { position: 16 },
        playerState: "playing",
      });

      page.says({
        event: "playback",
        songId: "song-1",
        state: "buffering",
        position: 16,
      });
      page.says({
        event: "playback",
        songId: "old-song",
        state: "playing",
        position: 100,
      });
      vi.advanceTimersByTime(10_000);
      expect(queue.editorPlayback()).toMatchObject({
        isPlaying: false,
        current: { position: 16 },
        playerState: "buffering",
      });

      queue.playback("pause");
      page.says({
        event: "playback",
        songId: "song-1",
        state: "paused",
        position: 16,
      });
      const commands = page.sent.length;
      page.says({
        event: "playback",
        songId: "song-1",
        state: "playing",
        position: 16,
      });
      vi.advanceTimersByTime(10_000);
      expect(queue.editorPlayback()).toMatchObject({
        isPlaying: true,
        isPaused: false,
        current: { position: 26 },
      });
      expect(page.sent).toHaveLength(commands);
      expect(queue.snapshot().isPaused).toBe(false);
      expect(started).toHaveBeenCalledTimes(fallback ? 0 : 1);
    },
  );
  it("sends the volume with a load and applies later volume changes", () => {
    const player = new PagePlayer();
    const page = new FakeSocket();
    player.connect(page);
    player.play(song, { muted: false, volume: 25 });
    player.setVolume(0);
    expect(page.sent).toEqual([
      {
        event: "load",
        songId: "song-1",
        videoId: "dQw4w9WgXcQ",
        muted: false,
        startAt: 0,
        volume: 25,
      },
      { event: "volume", volume: 0 },
    ]);
  });
  it("loads a paused Song and forwards pause and resume to the page", () => {
    const player = new PagePlayer();
    const page = new FakeSocket();
    player.connect(page);
    player.play(song, { muted: false, startAt: 12, paused: true });
    player.resume();
    player.pause();
    expect(page.sent).toEqual([
      {
        event: "load",
        songId: "song-1",
        videoId: "dQw4w9WgXcQ",
        muted: false,
        startAt: 12,
        paused: true,
      },
      { event: "resume" },
      { event: "pause" },
    ]);
  });
  it("is ready once a page connects, and says so", () => {
    const player = new PagePlayer();
    const heard = listen(player);
    const connected: boolean[] = [];
    player.onConnectionChange((value) => connected.push(value));

    expect(player.ready).toBe(false);

    player.connect(new FakeSocket());

    expect(player.ready).toBe(true);
    expect(heard).toEqual(["ready"]);
    expect(connected).toEqual([true]);
  });

  it("tells the page to load a Song, and passes on how it went", () => {
    const player = new PagePlayer();
    const heard = listen(player);
    const page = new FakeSocket();
    player.connect(page);

    player.play(song, { muted: false });
    expect(page.sent).toEqual([
      {
        event: "load",
        songId: "song-1",
        videoId: "dQw4w9WgXcQ",
        muted: false,
        startAt: 0,
      },
    ]);

    page.says({ event: "ended", songId: "song-1" });
    page.says({ event: "error", songId: "song-2", code: 150 });
    page.says({ event: "ended" });
    page.says("not json");
    expect(heard).toEqual(["ready", "ended song-1", "failed song-2"]);
  });

  it("plays a Song muted for its Start Check, then unmutes or stops it", () => {
    const player = new PagePlayer();
    listen(player);
    const page = new FakeSocket();
    player.connect(page);

    player.play(song, { muted: true });
    player.unmute("song-1");
    player.stop();

    expect(page.sent).toEqual([
      {
        event: "load",
        songId: "song-1",
        videoId: "dQw4w9WgXcQ",
        muted: true,
        startAt: 0,
      },
      { event: "unmute", songId: "song-1" },
      { event: "stop" },
    ]);
  });

  it("passes on how long a Song is, in whole seconds, and none for a live stream", () => {
    const player = new PagePlayer();
    const heard = listen(player);
    const page = new FakeSocket();
    player.connect(page);

    page.says({
      event: "loaded",
      songId: "song-1",
      duration: 212.6,
      live: false,
    });
    // The player gives a live stream's time on air as its duration.
    page.says({
      event: "loaded",
      songId: "song-2",
      duration: 5400,
      live: true,
    });

    expect(heard).toEqual([
      "ready",
      "loaded song-1 213",
      "loaded song-2 undefined",
    ]);
  });

  it("is no longer ready once its page closes", () => {
    const player = new PagePlayer();
    listen(player);
    const connected: boolean[] = [];
    player.onConnectionChange((value) => connected.push(value));
    const page = new FakeSocket();
    player.connect(page);

    page.close();

    expect(player.ready).toBe(false);
    expect(connected).toEqual([true, false]);
  });

  it("lets a new page replace the one before it", () => {
    const player = new PagePlayer();
    const heard = listen(player);
    const connected: boolean[] = [];
    player.onConnectionChange((value) => connected.push(value));
    const before = new FakeSocket();
    const after = new FakeSocket();
    player.connect(before);

    player.connect(after);
    player.play(song, { muted: false });
    before.says({ event: "ended", songId: "song-1" });

    expect(before.closed).toBe(true);
    expect(before.closedWith).toBe(REPLACED_CLOSE_CODE);
    expect(before.sent).toEqual([]);
    expect(after.sent).toHaveLength(1);
    expect(player.ready).toBe(true);
    expect(heard).toEqual(["ready", "ready"]);
    expect(connected.at(-1)).toBe(true);
  });

  it("closes the page for good when the Player Key is replaced", () => {
    const player = new PagePlayer();
    const heard = listen(player);
    const connected: boolean[] = [];
    player.onConnectionChange((value) => connected.push(value));
    const page = new FakeSocket();
    player.connect(page);

    player.closeForKeyChange();

    expect(page.closed).toBe(true);
    expect(page.closedWith).toBe(KEY_CHANGED_CLOSE_CODE);
    expect(player.ready).toBe(false);
    // The Song on air waits at its position, as with any disconnect, until
    // the page opened at the new address connects.
    expect(heard).toEqual(["ready", "disconnected"]);
    expect(connected).toEqual([true, false]);

    const next = new FakeSocket();
    player.connect(next);
    expect(player.ready).toBe(true);
    expect(heard.at(-1)).toBe("ready");
  });

  it("revokes the page before its key-change close handshake finishes", () => {
    const player = new PagePlayer();
    const heard = listen(player);
    const connected: boolean[] = [];
    player.onConnectionChange((value) => connected.push(value));
    const page = new FakeSocket();
    const close = vi.spyOn(page, "close").mockImplementation(() => {});
    player.connect(page);
    player.play(song, { muted: false });

    player.closeForKeyChange();
    page.says({ event: "ended", songId: song.id });
    page.says({ event: "error", songId: song.id, code: 150 });
    page.says({
      event: "playback",
      songId: song.id,
      state: "playing",
      position: 100,
    });
    page.says({
      event: "loaded",
      songId: song.id,
      duration: 200,
      live: false,
    });
    player.pause();

    expect(close).toHaveBeenCalledWith(KEY_CHANGED_CLOSE_CODE);
    expect(player.connected).toBe(false);
    expect(player.ready).toBe(false);
    expect(heard).toEqual(["ready", "disconnected"]);
    expect(connected).toEqual([true, false]);
    expect(page.sent).toHaveLength(1);

    const next = new FakeSocket();
    player.connect(next);
    close.mockRestore();
    page.close(KEY_CHANGED_CLOSE_CODE);
    page.says({ event: "ended", songId: song.id });
    player.play(song, { muted: false });

    expect(player.ready).toBe(true);
    expect(heard).toEqual(["ready", "disconnected", "ready"]);
    expect(connected).toEqual([true, false, true]);
    expect(next.sent).toHaveLength(1);
  });

  it("cancels a playlist listing without waiting for the key-change close handshake", async () => {
    vi.useFakeTimers();
    const player = new PagePlayer();
    const heard = listen(player);
    const page = new FakeSocket();
    vi.spyOn(page, "close").mockImplementation(() => {});
    player.connect(page);
    const listed = vi.fn();
    void player.listPlaylist("PLold").then(listed);

    player.closeForKeyChange();
    page.says({ event: "cued", requestId: "1", ids: ["old"] });
    await Promise.resolve();

    expect(listed).toHaveBeenCalledExactlyOnceWith([]);
    expect(vi.getTimerCount()).toBe(0);
    expect(player.connected).toBe(false);
    expect(heard).toEqual(["ready", "disconnected"]);
  });

  it("cues a playlist to list it, and answers with the ids the page lists", async () => {
    const player = new PagePlayer();
    const page = new FakeSocket();
    player.connect(page);

    const listing = player.listPlaylist("PLx0sYbCqOb8");
    expect(page.sent).toEqual([
      { event: "cue", requestId: "1", playlistId: "PLx0sYbCqOb8" },
    ]);
    page.says({
      event: "cued",
      requestId: "1",
      ids: ["dQw4w9WgXcQ", "video2xxxxx"],
    });
    await expect(listing).resolves.toEqual(["dQw4w9WgXcQ", "video2xxxxx"]);
  });

  it("answers an empty listing without a page, or when the page goes away mid-cue", async () => {
    const player = new PagePlayer();
    await expect(player.listPlaylist("PLx0sYbCqOb8")).resolves.toEqual([]);

    const page = new FakeSocket();
    player.connect(page);
    const listing = player.listPlaylist("PLx0sYbCqOb8");
    page.close();
    await expect(listing).resolves.toEqual([]);
  });

  it("finishes a listing when another page takes over, and can read from the new page", async () => {
    const player = new PagePlayer();
    const before = new FakeSocket();
    const after = new FakeSocket();
    player.connect(before);
    let settled = false;
    const first = player.listPlaylist("PLfirst").then((ids) => {
      settled = true;
      return ids;
    });

    player.connect(after);
    await Promise.resolve();
    expect(settled).toBe(true);
    await expect(first).resolves.toEqual([]);

    const second = player.listPlaylist("PLsecond");
    before.says({ event: "cued", requestId: "1", ids: ["old"] });
    after.says({ event: "cued", requestId: "2", ids: ["new"] });
    await expect(second).resolves.toEqual(["new"]);
  });

  it("bounds an unanswered cue so later playlist readings can proceed", async () => {
    vi.useFakeTimers();
    const player = new PagePlayer();
    const page = new FakeSocket();
    player.connect(page);
    let ids: string[] | undefined;
    void player.listPlaylist("PLunavailable").then((answer) => {
      ids = answer;
    });

    await vi.advanceTimersByTimeAsync(10_000);
    expect(ids).toEqual([]);
    expect(page.sent.at(-1)).toEqual({ event: "stop" });

    const next = player.listPlaylist("PLworking");
    page.says({ event: "cued", requestId: "1", ids: ["late"] });
    expect(page.sent.at(-1)).toMatchObject({ event: "cue", requestId: "2" });
    page.says({ event: "cued", requestId: "2", ids: ["working"] });
    await expect(next).resolves.toEqual(["working"]);
  });

  it.each(["ended", "failed", "skipped"])(
    "waits for the Current Song to be %s, learns the playlist, then starts the waiting Song",
    async (how) => {
      vi.useFakeTimers();
      const player = new PagePlayer();
      let id = 0;
      const queue = new SongQueue({
        providers: [
          {
            id: "youtube",
            player,
            claims: () => true,
            resolve: async (title) => ({
              kind: "track",
              track: { ...song, trackId: title, title, duration: 100 },
            }),
          },
        ],
        newId: () => `song-${++id}`,
      });
      const page = new FakeSocket();
      player.connect(page);
      await queue.request("first");
      page.says({
        event: "loaded",
        songId: "song-1",
        duration: 100,
        live: false,
      });
      const listing = fallbackPlaylistTracks(
        new DataApi({ fetch: vi.fn() }),
        "PLnew",
        "US",
        (id) => player.listPlaylist(id),
      ).then((tracks) => queue.setFallbackTracks(tracks));
      await queue.request("second");
      expect(
        page.sent.filter(
          (message) => (message as { event: string }).event === "cue",
        ),
      ).toEqual([]);

      if (how === "skipped") queue.skip();
      else
        page.says(
          how === "ended"
            ? { event: "ended", songId: "song-1" }
            : { event: "error", songId: "song-1", code: 150 },
        );
      expect(page.sent.at(-1)).toEqual({
        event: "cue",
        requestId: "1",
        playlistId: "PLnew",
      });
      expect(queue.status().playerConnected).toBe(true);
      expect(queue.status().queueLength).toBe(1);

      page.says({ event: "cued", requestId: "1", ids: [song.trackId] });
      await listing;
      await vi.advanceTimersByTimeAsync(0);
      expect(page.sent.at(-1)).toMatchObject({
        event: "load",
        songId: "song-2",
      });
      page.says({ event: "ended", songId: "song-2" });
      expect(page.sent.at(-1)).toMatchObject({
        event: "load",
        videoId: song.trackId,
      });
      expect(queue.status().isFallback).toBe(true);
    },
  );

  it.each([false, true])(
    "replaces the Fallback Playlist at the track boundary, preserving pause=%s",
    async (paused) => {
      vi.useFakeTimers();
      const player = new PagePlayer();
      let id = 0;
      const queue = new SongQueue({
        providers: [
          { id: "youtube", player, claims: () => true, resolve: vi.fn() },
        ],
        newId: () => `fallback-${++id}`,
      });
      const page = new FakeSocket();
      player.connect(page);
      queue.setFallbackTracks([{ ...song, duration: 100 }]);
      page.says({
        event: "loaded",
        songId: "fallback-1",
        duration: 100,
        live: false,
      });
      if (paused) queue.playback("pause");

      const learning = fallbackPlaylistTracks(
        new DataApi({ fetch: vi.fn() }),
        "PLnew",
        "US",
        (id) => player.listPlaylist(id),
      ).then((tracks) => queue.setFallbackTracks(tracks));
      await vi.advanceTimersByTimeAsync(20_000);
      expect(page.sent).not.toContainEqual(
        expect.objectContaining({ event: "cue" }),
      );

      if (paused) queue.skip();
      else page.says({ event: "ended", songId: "fallback-1" });
      page.says({ event: "cued", requestId: "1", ids: ["replacement"] });
      await learning;
      await vi.advanceTimersByTimeAsync(0);
      if (paused) {
        expect(queue.status().isPaused).toBe(true);
        expect(page.sent.at(-1)).not.toMatchObject({ event: "load" });
        queue.playback("resume");
      }
      expect(page.sent.at(-1)).toMatchObject({
        event: "load",
        videoId: "replacement",
      });
    },
  );
});

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SongQueueSnapshot } from "./songs/song-queue";
import { StateFile, stateFilePath } from "./state-file";
import { SongQueue } from "./songs/song-queue";
import { fakeProvider } from "./test-support/fake-provider";

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "song-requests-state-"));
  file = path.join(dir, "song-requests", "state.json");
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const song = {
  provider: "fake",
  trackId: "one",
  title: "One",
  channel: "Fake channel",
  channelId: "fake-channel",
  channelUrl: "fake://channel",
  url: "fake://one",
  duration: 200,
  requesterPlatform: "twitch",
  requesterId: "u1",
  requesterName: "viewer",
  reference: "redemption-1",
  id: "song-1",
};

const snapshot: SongQueueSnapshot = {
  waiting: [{ ...song, id: "song-2", trackId: "two", title: "Two" }],
  current: {
    song,
    atStartCheck: false,
    started: true,
    position: 42.5,
  },
  history: [{ song, how: "finished", at: 1_760_000_000_000 }],
};

describe("the State file", () => {
  it("restores a pause, silent volume and skipped History without losing the Song Queue", async () => {
    const { provider, player } = fakeProvider();
    let id = 0;
    const queue = new SongQueue({
      providers: [provider],
      newId: () => `${++id}`,
    });
    player.connect();
    await queue.request("fake:first@100");
    player.load();
    await queue.request("fake:second@100");
    queue.skip();
    player.load();
    queue.playback("pause");
    queue.setVolume(0);
    const saved = queue.snapshot();
    await new StateFile(file).save(saved);
    const loaded = await new StateFile(file).load();
    expect(loaded.recovered).toBe(false);
    const back = fakeProvider();
    const restored = new SongQueue({
      providers: [back.provider],
      newId: () => "new",
      initial: loaded.snapshot,
    });
    back.player.connect();
    expect(restored.snapshot()).toMatchObject({
      isPaused: true,
      volume: 0,
      history: [{ how: "skipped" }],
    });
    expect(back.player.played.at(-1)?.options).toMatchObject({
      paused: true,
      volume: 0,
    });
  });
  it("restores Requests Open, manual order and arrival order through a real State file", async () => {
    const { provider } = fakeProvider();
    let id = 0;
    const queue = new SongQueue({
      providers: [provider],
      newId: () => `${++id}`,
    });
    const requester = {
      requesterPlatform: "twitch",
      requesterId: "42",
      requesterName: "Viewer",
      reference: "redemption",
    };
    await queue.request("fake:in-turn@100", requester);
    await queue.request("fake:next@100", requester, { position: "next" });
    queue.reorder("1", 1);
    queue.requests("close");
    await new StateFile(file).save(queue.snapshot());
    const loaded = await new StateFile(file).load();
    const restored = new SongQueue({
      providers: [fakeProvider().provider],
      newId: () => `${++id}`,
      initial: loaded.snapshot,
    });
    expect(restored.requestsOpen).toBe(false);
    expect(restored.snapshot().waiting.map((song) => song.title)).toEqual([
      "in-turn",
      "next",
    ]);
    expect(await restored.request("fake:closed@100")).toEqual({
      kind: "refused",
      reason: "closed",
    });
    restored.requests("open");
    expect(
      await restored.request("fake:new-next@100", requester, {
        position: "next",
      }),
    ).toMatchObject({ position: 1 });
    expect(restored.snapshot().waiting.map((song) => song.title)).toEqual([
      "new-next",
      "in-turn",
      "next",
    ]);
    const latest = {
      kind: "requesterLatest" as const,
      requesterPlatform: "twitch",
      requesterId: "42",
    };
    expect(restored.remove(latest).map((song) => song.title)).toEqual([
      "new-next",
    ]);
    expect(restored.remove(latest).map((song) => song.title)).toEqual(["next"]);
  });

  it("lives in Fluxta's per-user application data folder, in one of the plugin's own", () => {
    const at = stateFilePath();

    expect(path.isAbsolute(at)).toBe(true);
    expect(
      at.endsWith(path.join("Fluxta", "song-requests", "state.json")),
    ).toBe(true);
  });

  it("starts empty when there is no file yet", async () => {
    expect(await new StateFile(file).load()).toEqual({ recovered: false });
  });

  it("round-trips the Song Queue", async () => {
    const state = new StateFile(file);
    await state.save(snapshot);

    expect((await fs.readFile(file, "utf8")).startsWith("{")).toBe(true);
    expect(await state.load()).toEqual({ snapshot, recovered: false });
  });

  it("reads old Next and In turn fields without losing the saved order", async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(
      file,
      JSON.stringify({
        version: 1,
        ...snapshot,
        waiting: [
          {
            ...song,
            id: "song-2",
            trackId: "two",
            title: "Two",
            position: "inTurn",
          },
          { ...song, position: "next" },
        ],
      }),
    );

    const loaded = await new StateFile(file).load();
    expect(loaded.recovered).toBe(false);
    expect(loaded.snapshot?.waiting.map((song) => song.title)).toEqual([
      "Two",
      "One",
    ]);
    for (const song of loaded.snapshot!.waiting)
      expect(song).not.toHaveProperty("position");

    const restored = new SongQueue({
      providers: [fakeProvider().provider],
      newId: () => "song-3",
      initial: loaded.snapshot,
    });
    expect(
      await restored.request("fake:three@100", undefined, { position: "next" }),
    ).toMatchObject({ position: 1 });
    expect(restored.snapshot().waiting.map((song) => song.title)).toEqual([
      "three",
      "Two",
      "One",
    ]);
  });

  it("reads a file written before the History as an empty one", async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const before = (({ waiting, current }) => ({ waiting, current }))(snapshot);
    await fs.writeFile(file, JSON.stringify({ version: 1, ...before }));

    const loaded = await new StateFile(file).load();

    expect(loaded).toEqual({
      snapshot: { ...before, history: [] },
      recovered: false,
    });
  });

  it("moves a broken file aside and starts empty", async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, "not json at all", "utf8");

    const loaded = await new StateFile(file).load();

    expect(loaded).toEqual({ recovered: true });
    await expect(fs.readFile(file, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    const left = (await fs.readdir(path.dirname(file))).filter((name) =>
      name.includes("broken"),
    );
    expect(left).toHaveLength(1);
    expect(
      await fs.readFile(path.join(path.dirname(file), left[0]), "utf8"),
    ).toBe("not json at all");
  });

  it("moves a file that does not match the shape aside and starts empty", async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify({ version: 1, waiting: "nope" }));

    const loaded = await new StateFile(file).load();

    expect(loaded).toEqual({ recovered: true });
    await expect(fs.readFile(file, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("never leaves a broken file behind an interrupted write", async () => {
    const state = new StateFile(file);
    // What a crash before the rename leaves: a whole old file and a whole
    // temporary one — or nothing at all, never half of one.
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(`${file}.tmp-1`, JSON.stringify({ stale: true }));
    await state.save(snapshot);
    await state.save({
      ...snapshot,
      waiting: [],
      current: undefined,
    });

    expect((await state.load()).snapshot?.waiting).toEqual([]);
    const names = await fs.readdir(path.dirname(file));
    expect(names.filter((name) => name.endsWith(".json"))).toEqual([
      "state.json",
    ]);
  });
});

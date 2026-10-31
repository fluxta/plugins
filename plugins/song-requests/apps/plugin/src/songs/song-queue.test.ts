import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FALLBACK_RULE_DEFAULTS,
  type BlocklistEntry,
  type RuleDefaults,
} from "song-requests-protocol";

import type {
  Player,
  PlayerEvents,
  Playable,
  Provider,
  Song,
  SongDroppedReason,
  Track,
} from "./provider";
import { HISTORY_MAX_AGE_MS } from "./history";
import {
  SongQueue,
  type RequestAnswer,
  type SongQueueSnapshot,
} from "./song-queue";

/** A Player whose page the test connects and whose Songs it loads and ends. */
class FakePlayer implements Player {
  ready = false;
  /** The titles of the Songs it was told to play. */
  readonly played: string[] = [];
  /** Everything it was told, in order: `play one`, `play one muted`, `unmute one`, `stop`. */
  readonly told: string[] = [];
  /** What it was told to play last — a Song or a Fallback Track. */
  lastPlayable?: Playable;
  readonly #titles = new Map<string, string>();
  #events?: PlayerEvents;

  play(
    song: Playable,
    { muted, startAt }: { muted: boolean; startAt?: number },
  ) {
    this.played.push(song.title);
    this.lastPlayable = song;
    this.told.push(
      `play ${song.title}${muted ? " muted" : ""}${startAt !== undefined ? ` at ${startAt}` : ""}`,
    );
    this.#titles.set(song.id, song.title);
  }

  unmute(songId: string) {
    this.told.push(`unmute ${this.#titles.get(songId)}`);
  }

  stop() {
    this.told.push("stop");
  }

  pause() {}
  resume() {}
  setVolume() {}

  attach(events: PlayerEvents) {
    this.#events = events;
  }

  connect() {
    this.ready = true;
    this.#events?.ready();
  }

  disconnect() {
    this.ready = false;
    this.#events?.disconnected();
  }

  /** The Song plays, and is this long — `undefined` for a live stream. */
  load(song: Playable, duration: number | undefined, title?: string) {
    this.#events?.loaded(song.id, duration, title);
  }

  end(song: Playable) {
    this.#events?.ended(song.id);
  }

  fail(song: Playable) {
    this.#events?.failed(song.id);
  }
}

/**
 * A Provider that knows nothing of YouTube: it claims `<id>:<title>`, with
 * `@<seconds>` after the title when it knows the track's duration — without,
 * the Song has its Start Check. It refuses `<id>:refuse` as not found, and
 * takes anything else whole as the title — the way a default Provider
 * answers search words.
 */
function fakeProvider(id: string, player = new FakePlayer()) {
  const provider: Provider = {
    id,
    player,
    claims: (request) => request.startsWith(`${id}:`),
    async resolve(request) {
      const prefix = `${id}:`;
      const text = request.startsWith(prefix)
        ? request.slice(prefix.length)
        : request;
      const [title, seconds] = text.split("@");
      if (title === "refuse") return { kind: "refused", reason: "not-found" };
      return {
        kind: "track",
        track: {
          provider: id,
          trackId: title,
          title,
          channel: `${id} channel`,
          channelUrl: `${id}://channel`,
          url: `${id}://${title}`,
          duration: seconds === undefined ? undefined : Number(seconds),
        },
      };
    },
  };
  return { provider, player };
}

function songOf(answer: RequestAnswer): Song {
  if (answer.kind !== "accepted") throw new Error(`refused: ${answer.reason}`);
  return answer.song;
}

function songQueue(...providers: Provider[]) {
  let next = 0;
  return new SongQueue({ providers, newId: () => `song-${++next}` });
}

type HeardSongEvent =
  | { event: "started"; song: Song }
  | { event: "ended"; song: Song; how: "finished" | "failed" | "skipped" }
  | {
      event: "dropped";
      song: Song;
      why: SongDroppedReason;
    };

function eventQueue(...providers: Provider[]) {
  let next = 0;
  const heard: HeardSongEvent[] = [];
  const queue = new SongQueue({
    providers,
    newId: () => `song-${++next}`,
    onStarted: (song) => heard.push({ event: "started", song }),
    onEnded: (song, how) => heard.push({ event: "ended", song, how }),
    onDropped: (song, why) => heard.push({ event: "dropped", song, why }),
  });
  return { queue, heard };
}

describe("the Song Queue", () => {
  it("puts accepted Songs In turn and waits while no Player is ready", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);

    expect(await queue.request("fake:one")).toMatchObject({
      kind: "accepted",
      position: 1,
      song: { id: "song-1", title: "one", provider: "fake" },
    });
    expect(await queue.request("fake:two")).toMatchObject({
      kind: "accepted",
      position: 2,
    });
    expect(player.played).toEqual([]);
  });

  it("plays the first Song once its Player is ready, then the next when it ends", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    const first = await queue.request("fake:one");
    await queue.request("fake:two");

    player.connect();
    expect(player.played).toEqual(["one"]);

    if (first.kind === "accepted") player.end(first.song);
    expect(player.played).toEqual(["one", "two"]);
  });

  it("puts a Song on air at once when nothing plays and its Player is ready", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();

    expect(await queue.request("fake:one")).toMatchObject({
      kind: "accepted",
      position: 0,
    });
    expect(await queue.request("fake:two")).toMatchObject({ position: 1 });
    expect(player.played).toEqual(["one"]);
  });

  it("gives a Song that cannot play up for the next one", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    const first = await queue.request("fake:one");
    await queue.request("fake:two");

    if (first.kind === "accepted") player.fail(first.song);
    expect(player.played).toEqual(["one", "two"]);
  });

  it("plays the Current Song again when its Player comes back", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    await queue.request("fake:one");
    await queue.request("fake:two");

    player.ready = false;
    player.connect();
    expect(player.played).toEqual(["one", "one"]);
  });

  it("plays the Songs of two Providers in order, each on its own Player", async () => {
    const tube = fakeProvider("tube");
    const wave = fakeProvider("wave");
    const queue = songQueue(tube.provider, wave.provider);
    wave.player.connect();

    const one = await queue.request("tube:one");
    const two = await queue.request("wave:two");
    await queue.request("tube:three");

    // The first Song's Player is not ready: the queue waits for it rather
    // than letting a later Song jump ahead on another Player.
    expect(wave.player.played).toEqual([]);

    tube.player.connect();
    expect(tube.player.played).toEqual(["one"]);

    if (one.kind === "accepted") tube.player.end(one.song);
    expect(wave.player.played).toEqual(["two"]);

    if (two.kind === "accepted") wave.player.end(two.song);
    expect(tube.player.played).toEqual(["one", "three"]);
  });

  it("hands a Request no Provider claims to the first, the default one", async () => {
    const tube = fakeProvider("tube");
    const wave = fakeProvider("wave");
    const queue = songQueue(tube.provider, wave.provider);

    expect(await queue.request("wave:two")).toMatchObject({
      song: { provider: "wave" },
    });
    expect(await queue.request("tube:refuse")).toEqual({
      kind: "refused",
      reason: "not-found",
    });
    // "plain words" is no one's link, so the default Provider gets it whole.
    expect(await queue.request("plain words")).toMatchObject({
      song: { provider: "tube", title: "plain words" },
    });
  });

  it("queues nothing for a refused Request", async () => {
    const { provider } = fakeProvider("fake");
    const queue = songQueue(provider);

    await queue.request("fake:refuse");
    expect(await queue.request("fake:one")).toMatchObject({ position: 1 });
  });

  it("ignores a Player reporting on a Song that is no longer on air", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    const first = await queue.request("fake:one");
    await queue.request("fake:two");
    await queue.request("fake:three");

    if (first.kind === "accepted") {
      player.end(first.song);
      player.end(first.song);
    }
    expect(player.played).toEqual(["one", "two"]);
  });
});

describe("the Song's Events", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires Started once the Player loads a Song, then Ended as finished", async () => {
    const { provider, player } = fakeProvider("fake");
    const { queue, heard } = eventQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one@200"));

    expect(heard).toEqual([]);

    player.load(one, 200);
    player.load(one, 200);
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({
      event: "started",
      song: { id: "song-1", duration: 200 },
    });

    player.end(one);
    expect(heard).toHaveLength(2);
    expect(heard[1]).toMatchObject({
      event: "ended",
      song: { id: "song-1" },
      how: "finished",
    });
  });

  it("fires Ended as failed when the Player breaks on air", async () => {
    const { provider, player } = fakeProvider("fake");
    const { queue, heard } = eventQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one@200"));
    player.load(one, 200);

    player.fail(one);

    expect(heard.map(({ event }) => event)).toEqual(["started", "ended"]);
    expect(heard[1]).toMatchObject({ how: "failed" });
  });

  it("drops a Song its Player cannot load, without Started or Ended", async () => {
    const { provider, player } = fakeProvider("fake");
    const { queue, heard } = eventQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one@200"));
    const two = songOf(await queue.request("fake:two@100"));

    player.fail(one);
    expect(heard).toEqual([
      { event: "dropped", song: one, why: "unavailable" },
    ]);

    player.load(two, 100);
    expect(heard.map(({ event }) => event)).toEqual(["dropped", "started"]);
  });

  it("fires Started only after a Start Check lets the Song be heard", async () => {
    const { provider, player } = fakeProvider("fake");
    const { queue, heard } = eventQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one"));

    expect(heard).toEqual([]);

    player.load(one, 180);
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({
      event: "started",
      song: { id: "song-1", duration: 180 },
    });
    expect(player.told).toEqual(["play one muted", "unmute one"]);
  });

  it("drops a live stream at its Start Check as unavailable", async () => {
    const { provider, player } = fakeProvider("fake");
    const { queue, heard } = eventQueue(provider);
    player.connect();
    const live = songOf(await queue.request("fake:live"));

    player.load(live, undefined);

    expect(heard).toEqual([
      { event: "dropped", song: live, why: "unavailable" },
    ]);
  });

  it("does not fire Started again when its Player comes back", async () => {
    const { provider, player } = fakeProvider("fake");
    const { queue, heard } = eventQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one"));
    player.load(one, 200);

    player.ready = false;
    player.connect();
    player.load(one, 200);

    expect(heard.map(({ event }) => event)).toEqual(["started"]);
  });

  it("fires nothing while a Song buffers through a network drop", async () => {
    const { provider, player } = fakeProvider("fake");
    const { queue, heard } = eventQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one@200"));
    player.load(one, 200);

    vi.advanceTimersByTime(10 * 60_000);
    expect(heard.map(({ event }) => event)).toEqual(["started"]);

    player.end(one);
    expect(heard.map(({ event }) => event)).toEqual(["started", "ended"]);
    expect(heard[1]).toMatchObject({ how: "finished" });
  });
});

describe("the Start Check", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is not needed by a Song whose duration is known", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();

    await queue.request("fake:one@200");

    expect(player.told).toEqual(["play one"]);
  });

  it("starts a Song of unknown duration muted, and lets it be heard once its Player tells it", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one"));

    expect(player.told).toEqual(["play one muted"]);

    player.load(one, 200);
    expect(player.told).toEqual(["play one muted", "unmute one"]);
  });

  it("drops a live stream unheard, and plays the next Song", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    const live = songOf(await queue.request("fake:live"));
    await queue.request("fake:two@100");

    player.load(live, undefined);

    expect(player.told).not.toContain("unmute live");
    expect(player.played).toEqual(["live", "two"]);
    expect(player.told.at(-1)).toBe("play two");
  });

  it("stops a dropped Song when no Song follows it", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    const live = songOf(await queue.request("fake:live"));

    player.load(live, undefined);

    expect(player.told).toEqual(["play live muted", "stop"]);
  });

  it("waits for its Player to tell the duration, however long that takes", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one"));
    await queue.request("fake:two@100");

    // A network drop leaves the player buffering, with no error (spike #3).
    vi.advanceTimersByTime(10 * 60_000);
    expect(player.told).toEqual(["play one muted"]);

    player.load(one, 200);
    expect(player.told).toEqual(["play one muted", "unmute one"]);
  });

  it("plays a Song that passed its Start Check as it is when its Player comes back", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one"));
    player.load(one, 200);

    player.ready = false;
    player.connect();

    expect(player.told.at(-1)).toBe("play one at 0");
  });

  it("drops a Song its Player refuses at load, and plays the next", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one"));
    await queue.request("fake:two@100");

    player.fail(one);

    expect(player.told).toEqual(["play one muted", "play two"]);
  });

  it("ignores what a Player says of a Song no longer on air", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one"));
    await queue.request("fake:two");
    player.fail(one);

    player.load(one, 200);
    player.load(one, undefined);

    expect(player.told).toEqual(["play one muted", "play two muted"]);
  });
});

describe("the State file's snapshot", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the waiting Songs and the Current Song with how far it has played", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one@200"));
    await queue.request("fake:two@100");
    player.load(one, 200);

    vi.advanceTimersByTime(42_000);

    expect(queue.snapshot()).toEqual({
      requestsOpen: true,
      isPaused: false,
      volume: 100,
      waiting: [expect.objectContaining({ id: "song-2", title: "two" })],
      current: {
        song: expect.objectContaining({ id: "song-1", title: "one" }),
        atStartCheck: false,
        started: true,
        position: 42,
      },
      history: [],
    });
  });

  it("answers changes with the State file in mind", async () => {
    const { provider, player } = fakeProvider("fake");
    const changes: string[] = [];
    let next = 0;
    const queue = new SongQueue({
      providers: [provider],
      newId: () => `song-${++next}`,
      onChange: () => changes.push("changed"),
    });
    player.connect();

    const one = songOf(await queue.request("fake:one@200"));
    player.load(one, 200);
    player.end(one);

    expect(changes).toEqual(["changed", "changed", "changed"]);
  });

  it("saves each waiting Song even with no Player Page connected", async () => {
    const { provider } = fakeProvider("fake");
    const saved: SongQueueSnapshot[] = [];
    let next = 0;
    const queue = new SongQueue({
      providers: [provider],
      newId: () => `song-${++next}`,
      onChange: () => saved.push(queue.snapshot()),
    });

    await queue.request("fake:one@200");
    await queue.request("fake:two@100");

    expect(
      saved.map((snapshot) => snapshot.waiting.map((song) => song.title)),
    ).toEqual([["one"], ["one", "two"]]);
  });

  it("brings the Song Queue back as it was", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one@200"));
    await queue.request("fake:two@100");
    await queue.request("fake:three@50");

    const snapshot = queue.snapshot();
    const back = new SongQueue({
      providers: [provider],
      newId: () => "song-restored",
      initial: snapshot,
    });
    expect(back.snapshot()).toEqual(snapshot);

    // The restored queue answers from where the old one stopped: one on air
    // again once its Player is ready, two and three still waiting behind it.
    player.connect();
    expect(player.told.at(-1)).toBe("play one");
    expect(await back.request("fake:four")).toMatchObject({ position: 3 });

    player.load(one, 200);
    player.end(one);
    expect(player.played).toEqual(["one", "one", "two"]);
  });

  it("resumes the Current Song at its saved position without a second Song Started", async () => {
    const { provider, player } = fakeProvider("fake");
    let next = 0;
    const heard: string[] = [];
    const queue = new SongQueue({
      providers: [provider],
      newId: () => `song-${++next}`,
      onStarted: (song) => heard.push(`started ${song.title}`),
    });
    player.connect();
    const one = songOf(await queue.request("fake:one@200"));
    player.load(one, 200);

    vi.advanceTimersByTime(30_000);
    const snapshot = queue.snapshot();
    expect(snapshot.current?.position).toBe(30);

    // A restart: a new queue from the State file, a new set of Events.
    new SongQueue({
      providers: [provider],
      newId: () => `song-${++next}`,
      initial: snapshot,
      onStarted: (song) => heard.push(`started ${song.title}`),
    });
    player.connect();

    expect(player.told.at(-1)).toBe("play one at 30");
    expect(heard).toEqual(["started one"]);

    player.load(one, 200);
    vi.advanceTimersByTime(10_000);
    player.end(one);

    expect(heard).toEqual(["started one"]);
  });

  it("plays a restored Song that never passed its Start Check muted, from its start", async () => {
    const { provider, player } = fakeProvider("fake");
    let next = 0;
    const heard: string[] = [];
    const queue = new SongQueue({
      providers: [provider],
      newId: () => `song-${++next}`,
      onStarted: (song) => heard.push(`started ${song.title}`),
    });
    player.connect();
    const one = songOf(await queue.request("fake:one"));

    const snapshot = queue.snapshot();
    new SongQueue({
      providers: [provider],
      newId: () => `song-${++next}`,
      initial: snapshot,
      onStarted: (song) => heard.push(`started ${song.title}`),
    });
    player.connect();

    expect(player.told.at(-1)).toBe("play one muted");
    expect(heard).toEqual([]);

    player.load(one, 180);
    expect(player.told.at(-2)).toBe("play one muted");
    expect(player.told.at(-1)).toBe("unmute one");
    expect(heard).toEqual(["started one"]);
  });

  it("does not grow a restored Song's position while its Player is away", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one@200"));
    player.load(one, 200);

    vi.advanceTimersByTime(30_000);
    const snapshot = queue.snapshot();

    // The Player Page is still closed after the restart: time passes, but
    // nothing of the Song plays, so a save would not move its position on.
    const back = new SongQueue({
      providers: [provider],
      newId: () => "song-restore",
      initial: snapshot,
    });
    vi.advanceTimersByTime(60_000);

    expect(back.snapshot().current?.position).toBe(30);
  });
});

describe("how long until a Song should start", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is what is left of the Current Song and every Song ahead", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    const one = await queue.request("fake:one@200");
    expect(one).toMatchObject({ position: 0, eta: 0 });

    expect(await queue.request("fake:two@100")).toMatchObject({ eta: 200 });

    player.load(songOf(one), 200);
    vi.advanceTimersByTime(50_000);
    expect(await queue.request("fake:three@60")).toMatchObject({ eta: 250 });
  });

  it("counts Songs waiting for their Player in full", async () => {
    const { provider } = fakeProvider("fake");
    const queue = songQueue(provider);

    expect(await queue.request("fake:one@200")).toMatchObject({
      position: 1,
      eta: 0,
    });
    vi.advanceTimersByTime(50_000);
    expect(await queue.request("fake:two@100")).toMatchObject({ eta: 200 });
  });

  it("counts the Current Song in full while its Player is away, since it plays again from its start", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one@200"));
    player.load(one, 200);
    vi.advanceTimersByTime(50_000);

    player.ready = false;
    vi.advanceTimersByTime(60_000);

    expect(await queue.request("fake:two@100")).toMatchObject({ eta: 200 });
  });

  it("counts a duration learned at the Start Check", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one"));
    player.load(one, 180);
    vi.advanceTimersByTime(30_000);

    expect(await queue.request("fake:two@60")).toMatchObject({ eta: 150 });
  });

  it("is not known while a duration it needs is not", async () => {
    const { provider } = fakeProvider("fake");
    const queue = songQueue(provider);

    await queue.request("fake:one@100");
    const unknown = await queue.request("fake:unknown");
    const after = await queue.request("fake:after@60");

    // Its own duration is not needed to know when a Song should start.
    expect(unknown).toMatchObject({ eta: 100 });
    expect(after.kind === "accepted" && after.eta).toBe(undefined);
  });

  it("is not known while the Current Song's duration is not", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    await queue.request("fake:one");

    const two = await queue.request("fake:two@60");

    expect(two).toMatchObject({ position: 1 });
    expect(two.kind === "accepted" && two.eta).toBe(undefined);
  });
});

/**
 * A Provider whose tracks carry what the Rules read: the request is the
 * title, `@<seconds>` the duration, and `channelUrl` / `music` are fixed for
 * all its tracks — the knobs the table's Rules turn on.
 */
function ruledProvider(
  {
    channelUrl = "fake://channel",
    music,
  }: { channelUrl?: string; music?: boolean } = {},
  player = new FakePlayer(),
) {
  const provider: Provider = {
    id: "fake",
    player,
    claims: (request) => request.startsWith("fake:"),
    async resolve(request) {
      const [title, seconds] = request.slice("fake:".length).split("@");
      return {
        kind: "track",
        track: {
          provider: "fake",
          trackId: title,
          title,
          channel: "Fake channel",
          channelUrl,
          url: `fake://${title}`,
          duration: seconds === undefined ? undefined : Number(seconds),
          music,
        },
      };
    },
  };
  return { provider, player };
}

function ruledQueue(
  provider: Provider,
  {
    defaults = {},
    blocklist = [],
  }: {
    defaults?: Partial<RuleDefaults>;
    blocklist?: BlocklistEntry[];
  } = {},
) {
  let next = 0;
  return new SongQueue({
    providers: [provider],
    newId: () => `song-${++next}`,
    rules: {
      defaults: () => ({ ...FALLBACK_RULE_DEFAULTS, ...defaults }),
      blocklist: () => blocklist,
    },
  });
}

describe("the Rules at their Defaults", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refuses as `closed` when the Defaults close Requests", async () => {
    const { provider } = ruledProvider();
    const closed = ruledQueue(provider, {
      defaults: { requestsOpen: false },
    });
    const open = ruledQueue(provider);

    expect(await closed.request("fake:one")).toEqual({
      kind: "refused",
      reason: "closed",
    });
    expect(await open.request("fake:one")).toMatchObject({
      kind: "accepted",
    });
  });

  it("refuses a Song longer than ten minutes as `too-long`, a shorter one never", async () => {
    const { provider } = ruledProvider();
    const queue = ruledQueue(provider);

    expect(await queue.request("fake:long@601")).toEqual({
      kind: "refused",
      reason: "too-long",
    });
    expect(await queue.request("fake:ten@600")).toMatchObject({
      kind: "accepted",
    });
    // The Default is no shortest bound: five seconds is a Song.
    expect(await queue.request("fake:tiny@5")).toMatchObject({
      kind: "accepted",
    });
    const withShortest = ruledQueue(provider, {
      defaults: { shortestDurationSeconds: 30 },
    });
    expect(await withShortest.request("fake:tiny@10")).toEqual({
      kind: "refused",
      reason: "too-short",
    });
  });

  it("refuses a fourth waiting Song of the same Requester as `requester-limit`", async () => {
    const { provider } = ruledProvider();
    const queue = ruledQueue(provider);
    const viewer = {
      requesterPlatform: "twitch",
      requesterId: "u1",
      requesterName: "viewer",
      reference: "",
    };

    for (const title of ["one", "two", "three"]) {
      expect(await queue.request(`fake:${title}`, viewer)).toMatchObject({
        kind: "accepted",
      });
    }
    expect(await queue.request("fake:four", viewer)).toEqual({
      kind: "refused",
      reason: "requester-limit",
    });
    // The same id on another Platform is another Requester.
    expect(
      await queue.request("fake:four", {
        ...viewer,
        requesterPlatform: "youtube",
      }),
    ).toMatchObject({ kind: "accepted" });
    // A Request without an id is not counted.
    expect(
      await queue.request("fake:five", {
        requesterPlatform: "twitch",
        requesterId: "",
        requesterName: "viewer",
        reference: "",
      }),
    ).toMatchObject({ kind: "accepted" });
  });

  it("refuses past the Default Song Queue size as `queue-full`", async () => {
    const { provider } = ruledProvider();
    const queue = ruledQueue(provider, { defaults: { queueSize: 2 } });

    await queue.request("fake:one");
    await queue.request("fake:two");
    expect(await queue.request("fake:three")).toEqual({
      kind: "refused",
      reason: "queue-full",
    });
  });

  it("refuses a track already waiting or on air as `already-queued`", async () => {
    const { provider, player } = ruledProvider();
    const queue = ruledQueue(provider);
    player.connect();

    const one = songOf(await queue.request("fake:one@200"));
    expect(await queue.request("fake:one@200")).toEqual({
      kind: "refused",
      reason: "already-queued",
    });
    // On air, once it plays.
    player.load(one, 200);
    expect(await queue.request("fake:one@200")).toEqual({
      kind: "refused",
      reason: "already-queued",
    });
    // A different track is fine.
    expect(await queue.request("fake:two@100")).toMatchObject({
      kind: "accepted",
    });
  });

  it("refuses a track that played within the hour as `recently-played`", async () => {
    const { provider, player } = ruledProvider();
    const queue = ruledQueue(provider);
    player.connect();

    const one = songOf(await queue.request("fake:one@200"));
    player.load(one, 200);
    player.end(one);

    expect(await queue.request("fake:one@200")).toEqual({
      kind: "refused",
      reason: "recently-played",
    });

    vi.advanceTimersByTime(3601_000);
    expect(await queue.request("fake:one@200")).toMatchObject({
      kind: "accepted",
    });
  });

  it("refuses a blocked track or one of a blocked channel as `blocked`", async () => {
    const { provider } = ruledProvider();
    const byTrack = ruledQueue(provider, {
      blocklist: [{ kind: "track", provider: "fake", trackId: "one" }],
    });
    expect(await byTrack.request("fake:one@200")).toEqual({
      kind: "refused",
      reason: "blocked",
    });
    expect(await byTrack.request("fake:two@200")).toMatchObject({
      kind: "accepted",
    });

    // Without the API Key a channel is matched by the address oEmbed gives
    // (ADR-0005): the track's own channelUrl.
    const bad = ruledProvider({ channelUrl: "fake://bad" });
    const byChannel = ruledQueue(bad.provider, {
      blocklist: [{ kind: "channel", channelUrl: "fake://bad" }],
    });
    expect(await byChannel.request("fake:one@200")).toEqual({
      kind: "refused",
      reason: "blocked",
    });
  });

  it("refuses what is not music as `not-music` only where the Provider said", async () => {
    const speech = ruledProvider({ music: false });
    const quiet = ruledQueue(speech.provider, {
      defaults: { musicOnly: true },
    });
    expect(await quiet.request("fake:words@200")).toEqual({
      kind: "refused",
      reason: "not-music",
    });

    // Without the API Key a track's kind is not known: Music only is not
    // checked, whatever the Default says.
    const unknown = ruledProvider();
    const guessing = ruledQueue(unknown.provider, {
      defaults: { musicOnly: true },
    });
    expect(await guessing.request("fake:words@200")).toMatchObject({
      kind: "accepted",
    });
  });
});

describe("a step's Overrides", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("applies to its own step only — another step follows the Defaults", async () => {
    const { provider } = ruledProvider();
    const queue = ruledQueue(provider);
    const narrow = { queueSize: { mode: "value", value: 1 } } as const;

    expect(
      await queue.request("fake:one", undefined, { overrides: narrow }),
    ).toMatchObject({ kind: "accepted" });
    // The Default is 50: a step without the Override queues behind it.
    expect(await queue.request("fake:two")).toMatchObject({
      kind: "accepted",
    });
    expect(
      await queue.request("fake:three", undefined, { overrides: narrow }),
    ).toEqual({ kind: "refused", reason: "queue-full" });
  });

  it("wins over a closed Default, so a moderator's step always gets in", async () => {
    const { provider } = ruledProvider();
    const queue = ruledQueue(provider, {
      defaults: { requestsOpen: false },
    });

    expect(
      await queue.request("fake:one", undefined, {
        overrides: { requestsOpen: { mode: "off" } },
      }),
    ).toMatchObject({ kind: "accepted" });
    // "Do not check" goes no further than its own step.
    expect(await queue.request("fake:two")).toEqual({
      kind: "refused",
      reason: "closed",
    });
  });

  it("lets a long-song step through the Default ten minutes, its bounds its own", async () => {
    const { provider, player } = ruledProvider();
    const queue = ruledQueue(provider);
    player.connect();

    const long = songOf(
      await queue.request("fake:long@900", undefined, {
        overrides: { longestDurationSeconds: { mode: "value", value: 1200 } },
      }),
    );
    expect(long.durationBounds).toEqual({ maxSeconds: 1200 });
    // Its duration is known, so it plays at once — no Start Check, no mute.
    player.load(long, 900);
    expect(player.told).toEqual(["play long"]);

    // A step following the Default still meets ten minutes at its Start
    // Check, unheard.
    player.end(long);
    const plain = songOf(await queue.request("fake:plain"));
    expect(plain.durationBounds).toEqual({ maxSeconds: 600 });
    expect(player.told.at(-1)).toBe("play plain muted");
    player.load(plain, 900);
    expect(player.told.at(-1)).toBe("stop");
  });
});

describe("the duration bounds at the Start Check", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("drops a Song outside its bounds as `too-long`, before anything of it is heard", async () => {
    const { provider, player } = ruledProvider();
    const { queue, heard } = eventQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one"));
    await queue.request("fake:two@100");

    player.load(one, 601);

    expect(heard).toEqual([{ event: "dropped", song: one, why: "too-long" }]);
    // Unheard: never unmuted, stopped, and the next Song goes on.
    expect(player.told).not.toContain("unmute one");
    expect(player.told.at(-1)).toBe("play two");
  });

  it("drops one under its step's shortest bound as `too-short`", async () => {
    const { provider, player } = ruledProvider();
    const queue = ruledQueue(provider, {
      defaults: { shortestDurationSeconds: 60 },
    });
    player.connect();
    const one = songOf(await queue.request("fake:one"));

    player.load(one, 30);

    expect(player.told).toEqual(["play one muted", "stop"]);
  });

  it("lets a Song inside its bounds be heard", async () => {
    const { provider, player } = ruledProvider();
    const queue = ruledQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one"));

    player.load(one, 599);

    expect(player.told).toEqual(["play one muted", "unmute one"]);
  });
});

describe("the History", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("records how each Song left the air, newest first", async () => {
    const { provider, player } = ruledProvider();
    const { queue, heard } = eventQueue(provider);
    player.connect();

    const one = songOf(await queue.request("fake:one@200"));
    player.load(one, 200);
    vi.advanceTimersByTime(10_000);
    player.end(one);

    const two = songOf(await queue.request("fake:two@100"));
    player.load(two, 100);
    player.fail(two);

    expect(heard.map(({ event }) => event)).toEqual([
      "started",
      "ended",
      "started",
      "ended",
    ]);
    expect(
      queue.snapshot().history.map(({ song, how }) => [song.id, how]),
    ).toEqual([
      ["song-2", "failed"],
      ["song-1", "finished"],
    ]);
  });

  it("never records a Song that never reached the air", async () => {
    const { provider, player } = ruledProvider();
    const { queue, heard } = eventQueue(provider);
    player.connect();

    const live = songOf(await queue.request("fake:live"));
    player.load(live, undefined);

    expect(heard).toEqual([
      { event: "dropped", song: live, why: "unavailable" },
    ]);
    expect(queue.snapshot().history).toEqual([]);
  });

  it("keeps at most 200 and nothing older than 30 days", async () => {
    const { provider, player } = ruledProvider();
    player.connect();

    // A busy restart: 250 Songs ended a moment ago — more than the History
    // keeps — and one more goes on air a month later, by which time the
    // month-old ones are older than the History keeps.
    const now = 100 * 24 * 60 * 60 * 1000;
    let next = 0;
    const seeded: SongQueueSnapshot = {
      waiting: [],
      history: Array.from({ length: 250 }, (_, i) => ({
        song: {
          provider: "fake",
          trackId: `old-${i}`,
          title: `old-${i}`,
          channel: "Fake channel",
          channelUrl: "fake://channel",
          url: `fake://old-${i}`,
          requesterPlatform: "",
          requesterId: "",
          requesterName: "",
          reference: "",
          id: `song-old-${i}`,
        },
        how: "finished" as const,
        at: now - 1000 - i,
      })),
    };
    vi.setSystemTime(now);
    const queue = new SongQueue({
      providers: [provider],
      newId: () => `song-${++next}`,
      initial: seeded,
      rules: {
        defaults: () => FALLBACK_RULE_DEFAULTS,
        blocklist: () => [],
      },
    });
    // The load of a month-old file is trimmed at once: only the 200 newest.
    expect(queue.snapshot().history).toHaveLength(200);

    vi.setSystemTime(now + 31 * 24 * 60 * 60 * 1000);
    const fresh = songOf(await queue.request("fake:fresh@10"));
    player.load(fresh, 10);
    player.end(fresh);

    const history = queue.snapshot().history;
    expect(history).toHaveLength(1);
    expect(history[0].song.id).toBe(fresh.id);
    expect(history[0].how).toBe("finished");
  });

  it("survives a restart", async () => {
    const { provider, player } = ruledProvider();
    const queue = ruledQueue(provider);
    player.connect();

    const one = songOf(await queue.request("fake:one@200"));
    player.load(one, 200);
    player.end(one);

    const back = new SongQueue({
      providers: [provider],
      newId: () => "song-restored",
      initial: queue.snapshot(),
    });

    expect(back.snapshot().history).toEqual(queue.snapshot().history);
  });
});

describe("the Plugin Editor's History", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * A fake Provider whose links resolve back to the same track — the way a
   * Provider's URLs round-trip in production — so Queue again's Request of
   * the Song's link lands on the same track. `fake://<title>` keeps the
   * title as its trackId, with no duration, like a keyless link.
   */
  function urlProvider() {
    const { provider, player } = fakeProvider("fake");
    return {
      player,
      provider: {
        ...provider,
        claims: (request: string) =>
          request.startsWith("fake:") || request.startsWith("fake://"),
        async resolve(request: string) {
          if (request.startsWith("fake://")) {
            const title = request.slice("fake://".length);
            return {
              kind: "track" as const,
              track: {
                provider: "fake",
                trackId: title,
                title,
                channel: "fake channel",
                channelUrl: "fake://channel",
                url: `fake://${title}`,
              },
            };
          }
          return provider.resolve(request);
        },
      },
    };
  }

  it("answers the Songs that left the air, newest first, with when, the Requester and how", async () => {
    const { provider, player } = ruledProvider();
    const queue = ruledQueue(provider);
    player.connect();
    vi.setSystemTime(1000 * 60 * 60);

    const one = songOf(
      await queue.request("fake:one@200", {
        requesterPlatform: "twitch",
        requesterId: "user-1",
        requesterName: "viewer",
        reference: "",
      }),
    );
    player.load(one, 200);
    vi.advanceTimersByTime(10_000);
    player.end(one);

    const two = songOf(await queue.request("fake:two@100"));
    player.load(two, 100);
    vi.advanceTimersByTime(5000);
    player.fail(two);

    expect(queue.editorHistory()).toEqual([
      {
        id: two.id,
        title: "two",
        channel: "Fake channel",
        url: "fake://two",
        requesterName: "",
        duration: 100,
        how: "failed",
        at: Date.now(),
      },
      {
        id: one.id,
        title: "one",
        channel: "Fake channel",
        url: "fake://one",
        requesterName: "viewer",
        duration: 200,
        how: "finished",
        at: Date.now() - 5000,
      },
    ]);
  });

  it("stops showing expired History entries without another Song leaving the air", async () => {
    const { provider, player } = ruledProvider();
    const queue = ruledQueue(provider);
    player.connect();

    const one = songOf(await queue.request("fake:one@200"));
    player.load(one, 200);
    player.end(one);
    const endedAt = Date.now();

    vi.setSystemTime(endedAt + HISTORY_MAX_AGE_MS);
    expect(queue.editorHistory().map((entry) => entry.id)).toEqual([one.id]);

    vi.setSystemTime(endedAt + HISTORY_MAX_AGE_MS + 1);
    expect(queue.editorHistory()).toEqual([]);
  });

  it("queues a History Song again as the streamer's own Request, checked with the Defaults", async () => {
    const { provider, player } = urlProvider();
    // Played within 0: the Song may play again at once, so the new Request
    // is not refused as `recently-played`.
    const queue = ruledQueue(provider, {
      defaults: { playedWithinSeconds: 0 },
    });
    player.connect();

    const one = songOf(await queue.request("fake:one@200"));
    player.load(one, 200);
    player.end(one);

    const blocker = songOf(await queue.request("fake:blocker@500"));
    player.load(blocker, 500);

    const again = await queue.queueAgain(one.id);
    // What is left of what is on air — its own duration is not needed for this.
    expect(again).toMatchObject({ kind: "accepted", position: 1, eta: 500 });

    const waiting = queue.snapshot().waiting;
    expect(waiting).toHaveLength(1);
    // The streamer's own Request: no Requester, and a new Song with a new id.
    expect(waiting[0]).toMatchObject({
      title: "one",
      requesterName: "",
      requesterId: "",
    });
    expect(waiting[0].id).not.toBe(one.id);
  });

  it("answers a Queue again with the Refusal's reason — the Defaults are checked", async () => {
    const { provider, player } = urlProvider();
    const queue = ruledQueue(provider);
    player.connect();

    const one = songOf(await queue.request("fake:one@200"));
    player.load(one, 200);
    player.end(one);

    // The Default hour has not passed since it left the air.
    expect(await queue.queueAgain(one.id)).toEqual({
      kind: "refused",
      reason: "recently-played",
    });
  });

  it("answers nothing for a Song the History no longer holds", async () => {
    const { provider } = ruledProvider();
    const queue = ruledQueue(provider);

    expect(await queue.queueAgain("song-missing")).toBeUndefined();
    expect(queue.blockHistorySong("song-missing", "track")).toBeUndefined();
  });

  it("blocks a History Song's track — the Blocklist entry Block Song makes", async () => {
    const { provider, player } = ruledProvider();
    const blocked: BlocklistEntry[] = [];
    let next = 0;
    const queue = new SongQueue({
      providers: [provider],
      newId: () => `song-${++next}`,
      onBlock: (entry) => {
        blocked.push(entry);
        return true;
      },
    });
    player.connect();

    const one = songOf(await queue.request("fake:one@200"));
    player.load(one, 200);
    player.end(one);

    expect(queue.blockHistorySong(one.id, "track")).toEqual(one);
    expect(blocked).toEqual([
      { kind: "track", provider: "fake", trackId: "one" },
    ]);
    // The History itself is left as it is.
    expect(queue.snapshot().history).toHaveLength(1);
  });

  it("blocks a History Song's channel and drops the waiting Songs it covers", async () => {
    const { provider, player } = ruledProvider();
    const blocked: BlocklistEntry[] = [];
    let next = 0;
    const heard: HeardSongEvent[] = [];
    const queue = new SongQueue({
      providers: [provider],
      newId: () => `song-${++next}`,
      onBlock: (entry) => {
        blocked.push(entry);
        return true;
      },
      onDropped: (song, why) => heard.push({ event: "dropped", song, why }),
    });
    player.connect();

    const one = songOf(await queue.request("fake:one@200"));
    player.load(one, 200);
    player.end(one);

    const waiting = songOf(await queue.request("fake:another@100"));

    expect(queue.blockHistorySong(one.id, "channel")).toEqual(one);
    expect(blocked).toEqual([
      { kind: "channel", provider: "fake", channelUrl: "fake://channel" },
    ]);
    expect(queue.snapshot().waiting).toEqual([]);
    expect(heard).toEqual([
      { event: "dropped", song: waiting, why: "blocked" },
    ]);
  });
});

function fallbackTrack(title: string, duration?: number): Track {
  return {
    provider: "fake",
    trackId: title,
    title,
    channel: "fake channel",
    channelUrl: "fake://channel",
    url: `fake://${title}`,
    ...(duration === undefined ? {} : { duration }),
  };
}

/**
 * The Fallback Playlist against a fake Provider's Player. `random` fixed at
 * 0 makes the shuffle deterministic: Fisher-Yates over [a, b, c, d] gives
 * the order b, c, d, a.
 */
function fallbackQueue() {
  const { provider, player } = fakeProvider("fake");
  let next = 0;
  const heard: HeardSongEvent[] = [];
  const queue = new SongQueue({
    providers: [provider],
    newId: () => `song-${++next}`,
    random: () => 0,
    onStarted: (song) => heard.push({ event: "started", song }),
    onEnded: (song, how) => heard.push({ event: "ended", song, how }),
    onDropped: (song, why) => heard.push({ event: "dropped", song, why }),
  });
  player.connect();
  return { queue, player, heard };
}

describe("the Fallback Playlist", () => {
  it("plays shuffled while the Song Queue is empty; with none learned the player stays silent", () => {
    const { queue, player } = fallbackQueue();
    queue.setFallbackTracks(undefined);
    expect(player.played).toEqual([]);

    queue.setFallbackTracks([
      fallbackTrack("a", 100),
      fallbackTrack("b", 100),
      fallbackTrack("c", 100),
      fallbackTrack("d", 100),
    ]);
    expect(player.played).toEqual(["b"]);
    expect(queue.status()).toMatchObject({
      isFallback: true,
      currentTitle: "b",
      currentRequester: "",
      queueLength: 0,
    });
  });

  it("hands the Player one Fallback Track at a time and shuffles again after the last", () => {
    const { queue, player } = fallbackQueue();
    queue.setFallbackTracks([
      fallbackTrack("a", 100),
      fallbackTrack("b", 100),
      fallbackTrack("c", 100),
      fallbackTrack("d", 100),
    ]);

    // Each track plays once, in the shuffled order — never the playlist at once.
    for (const title of ["c", "d", "a"]) {
      player.end(player.lastPlayable!);
      expect(player.played.at(-1)).toBe(title);
    }
    // Past the last track the playlist is shuffled again: b opens the next pass.
    player.end(player.lastPlayable!);
    expect(player.played.at(-1)).toBe("b");
  });

  it("lets a Song wait for the Fallback Track on air and comes back when the Song Queue is empty again", async () => {
    const { queue, player, heard } = fallbackQueue();
    queue.setFallbackTracks([fallbackTrack("a", 100), fallbackTrack("b", 100)]);
    player.load(player.lastPlayable!, 100);

    const answer = await queue.request("fake:requested@120");
    expect(answer).toMatchObject({ kind: "accepted", position: 1, eta: 100 });
    expect(player.played).toEqual(["b"]);

    player.end(player.lastPlayable!);
    expect(player.played.at(-1)).toBe("requested");

    const song = player.lastPlayable!;
    player.load(song, 120);
    expect(heard).toEqual([
      {
        event: "started",
        song: expect.objectContaining({ title: "requested" }),
      },
    ]);
    player.end(song);
    expect(player.played.at(-1)).toBe("a");
    expect(queue.status().isFallback).toBe(true);
  });

  it("Skip moves to the next Fallback Track, or to a waiting Song, firing no Song Event", async () => {
    const { queue, player, heard } = fallbackQueue();
    queue.setFallbackTracks([fallbackTrack("a", 100), fallbackTrack("b", 100)]);

    expect(queue.skip()).toMatchObject({ title: "b" });
    expect(player.played.at(-1)).toBe("a");

    const answer = await queue.request("fake:waiting@60");
    expect(answer.kind).toBe("accepted");
    expect(queue.skip()).toMatchObject({ title: "a" });
    expect(player.played.at(-1)).toBe("waiting");
    expect(heard).toEqual([]);
    expect(queue.snapshot().history).toEqual([]);
  });

  it("skips a Fallback Track that fails at load, without an Event or a History entry", () => {
    const { queue, player, heard } = fallbackQueue();
    queue.setFallbackTracks([fallbackTrack("a", 100), fallbackTrack("b", 100)]);

    player.fail(player.lastPlayable!);
    expect(player.played).toEqual(["b", "a"]);
    expect(heard).toEqual([]);
    expect(queue.snapshot().history).toEqual([]);
  });

  it("checks no Rules for Fallback Tracks: one far past the longest duration plays", () => {
    const { queue, player, heard } = fallbackQueue();
    queue.setFallbackTracks([
      fallbackTrack("long", 10_000),
      fallbackTrack("short", 100),
    ]);

    expect(player.played).toEqual(["short"]);
    player.load(player.lastPlayable!, 100);
    player.end(player.lastPlayable!);
    expect(player.played.at(-1)).toBe("long");
    expect(heard).toEqual([]);
    expect(queue.snapshot().history).toEqual([]);
  });

  it("learns a keyless Fallback Track's title at its Start Check and skips a live one", () => {
    const { queue, player } = fallbackQueue();
    queue.setFallbackTracks([
      fallbackTrack("c", 100),
      { ...fallbackTrack("keyless"), title: "" },
      fallbackTrack("live"),
    ]);

    // No duration known: it plays muted, and the player names it as it loads.
    expect(player.told.at(-1)).toBe("play  muted");
    const keyless = player.lastPlayable!;
    player.load(keyless, 90, "The Title The Player Holds");
    expect(player.told.at(-1)).toBe("unmute ");
    expect(queue.status()).toMatchObject({
      isFallback: true,
      currentTitle: "The Title The Player Holds",
    });

    // A live stream has no end: it cannot keep the stream company, so it is skipped.
    player.end(keyless);
    const live = player.lastPlayable!;
    expect(live.trackId).toBe("live");
    player.load(live, undefined);
    expect(player.played.at(-1)).toBe("c");
    expect(queue.status().currentTitle).toBe("c");
  });

  it("counts a keyless Fallback Track's eta once the player reports its duration", async () => {
    const { queue, player } = fallbackQueue();
    queue.setFallbackTracks([{ ...fallbackTrack("keyless"), title: "" }]);

    // The track came without a duration: no eta until the player reports one.
    const waiting = await queue.request("fake:waiting@60");
    expect(waiting).toMatchObject({ kind: "accepted", position: 1 });
    expect(waiting.kind === "accepted" && waiting.eta).toBe(undefined);

    player.load(player.lastPlayable!, 90, "Keyless");
    const behind = await queue.request("fake:behind@60");
    expect(behind).toMatchObject({ kind: "accepted", position: 2, eta: 150 });
  });

  it("keeps a requested Song waiting while the playlist is learned after it", async () => {
    const { queue, player } = fallbackQueue();
    const answer = await queue.request("fake:first@100");
    expect(answer).toMatchObject({ kind: "accepted", position: 0 });
    expect(player.played).toEqual(["first"]);

    // Learning the playlist does not interrupt the Current Song.
    queue.setFallbackTracks([fallbackTrack("a", 100)]);
    expect(player.played).toEqual(["first"]);

    player.load(player.lastPlayable!, 100);
    player.end(player.lastPlayable!);
    expect(player.played.at(-1)).toBe("a");
  });
});

describe("the Plugin Editor's Now and the queue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reorders a waiting Song by drag; the new order is the snapshot's", async () => {
    const { provider } = fakeProvider("fake");
    const queue = songQueue(provider);
    const one = songOf(await queue.request("fake:one@100"));
    const two = songOf(await queue.request("fake:two@100"));
    const three = songOf(await queue.request("fake:three@100"));

    queue.reorder(three.id, 1);
    expect(queue.snapshot().waiting.map((song) => song.title)).toEqual([
      "three",
      "one",
      "two",
    ]);

    queue.reorder(one.id, 3);
    expect(queue.snapshot().waiting.map((song) => song.title)).toEqual([
      "three",
      "two",
      "one",
    ]);

    // Out of range and unknown Songs move nothing.
    queue.reorder(two.id, 99);
    expect(queue.snapshot().waiting.map((song) => song.title)).toEqual([
      "three",
      "one",
      "two",
    ]);
    queue.reorder("song-0", 1);
    expect(queue.snapshot().waiting.map((song) => song.title)).toEqual([
      "three",
      "one",
      "two",
    ]);
  });

  it("inserts around the manual order without keeping Next and In turn groups", async () => {
    const { provider } = fakeProvider("fake");
    const queue = songQueue(provider);
    await queue.request("fake:one@100");
    const two = songOf(await queue.request("fake:two@100"));
    const three = songOf(
      await queue.request("fake:three@100", undefined, { position: "next" }),
    );
    await queue.request("fake:four@100", undefined, { position: "next" });
    queue.reorder(three.id, 4);
    queue.reorder(two.id, 1);
    expect(queue.snapshot().waiting.map((song) => song.title)).toEqual([
      "two",
      "four",
      "one",
      "three",
    ]);
    await queue.request("fake:five@100", undefined, { position: "next" });
    await queue.request("fake:six@100");
    expect(queue.snapshot().waiting.map((song) => song.title)).toEqual([
      "five",
      "two",
      "four",
      "one",
      "three",
      "six",
    ]);
    for (const song of queue.snapshot().waiting)
      expect(song).not.toHaveProperty("position");
  });

  it("moves a waiting Song first, ahead of every other waiting Song", async () => {
    const { provider } = fakeProvider("fake");
    const queue = songQueue(provider);
    await queue.request("fake:one@100");
    await queue.request("fake:two@100");
    const three = songOf(
      await queue.request("fake:three@100", undefined, {
        position: "next",
      }),
    );
    const four = songOf(
      await queue.request("fake:four@100", undefined, {
        position: "next",
      }),
    );

    queue.moveToNext("song-1");
    expect(queue.snapshot().waiting.map((song) => song.title)).toEqual([
      "one",
      "four",
      "three",
      "two",
    ]);

    queue.moveToNext(three.id);
    expect(queue.snapshot().waiting.map((song) => song.title)).toEqual([
      "three",
      "one",
      "four",
      "two",
    ]);
    void four;
  });

  it("reorders and moves without firing a Song Event or touching the Current Song", async () => {
    const { provider, player } = fakeProvider("fake");
    const { queue, heard } = eventQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one@200"));
    await queue.request("fake:two@100");
    const three = songOf(await queue.request("fake:three@100"));
    player.load(one, 200);

    queue.reorder(three.id, 1);
    queue.moveToNext(three.id);

    expect(heard).toEqual([{ event: "started", song: one }]);
    expect(player.played).toEqual(["one"]);
  });

  it("answers the Now and the queue the way the editor renders them", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one@200"));
    await queue.request("fake:two@100");
    const three = await queue.request("fake:unknown");
    player.load(one, 200);
    vi.advanceTimersByTime(10_000);
    queue.setVolume(40);
    queue.requests("close");

    expect(queue.editorPlayback()).toMatchObject({
      isPaused: false,
      volume: 40,
      requestsOpen: false,
      current: {
        id: one.id,
        title: "one",
        requesterName: "",
        isFallback: false,
        duration: 200,
        atStartCheck: false,
      },
      waiting: [
        {
          id: "song-2",
          title: "two",
          duration: 100,
          eta: 190,
        },
        {
          title: "unknown",
          duration: null,
          // Its own duration is not needed for the eta — only the Songs
          // ahead of it are: 190 left of the Current Song, then 100.
          eta: 290,
        },
      ],
    });
    expect(queue.editorPlayback().current?.position).toBe(10);
    expect(three.kind).toBe("accepted");
  });

  it("names a Fallback Track on air as one, with no Requester", async () => {
    const { queue, player } = fallbackQueue();
    queue.setFallbackTracks([fallbackTrack("a", 100)]);
    player.load(player.lastPlayable!, 100);

    expect(queue.editorPlayback().current).toMatchObject({
      title: "a",
      isFallback: true,
      requesterName: "",
      duration: 100,
    });
  });

  it("advances the editor's progress only after loading, until paused or disconnected", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one@200"));

    vi.advanceTimersByTime(10_000);
    expect(queue.editorPlayback()).toMatchObject({
      isPlaying: false,
      isPaused: false,
      current: { position: 0 },
    });

    player.load(one, 200);
    vi.advanceTimersByTime(10_000);
    expect(queue.editorPlayback()).toMatchObject({
      isPlaying: true,
      current: { position: 10 },
    });

    queue.playback("pause");
    vi.advanceTimersByTime(10_000);
    expect(queue.editorPlayback()).toMatchObject({
      isPlaying: false,
      isPaused: true,
      current: { position: 10 },
    });

    queue.playback("resume");
    vi.advanceTimersByTime(5_000);
    expect(queue.editorPlayback()).toMatchObject({
      isPlaying: true,
      isPaused: false,
      current: { position: 15 },
    });

    player.disconnect();
    vi.advanceTimersByTime(30_000);
    expect(queue.editorPlayback()).toMatchObject({
      isPlaying: false,
      isPaused: false,
      current: { position: 15 },
    });

    player.connect();
    vi.advanceTimersByTime(10_000);
    expect(queue.editorPlayback()).toMatchObject({
      isPlaying: false,
      current: { position: 15 },
    });

    player.load(one, 200);
    vi.advanceTimersByTime(5_000);
    expect(queue.editorPlayback()).toMatchObject({
      isPlaying: true,
      current: { position: 20 },
    });
  });

  it("keeps a restored Current Song's progress still until its Player loads it", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one@200"));
    player.load(one, 200);
    vi.advanceTimersByTime(10_000);

    const restored = new SongQueue({
      providers: [fakeProvider("fake").provider],
      newId: () => "song-2",
      initial: queue.snapshot(),
    });
    vi.advanceTimersByTime(30_000);

    expect(restored.editorPlayback()).toMatchObject({
      isPlaying: false,
      isPaused: false,
      current: { position: 10 },
    });
  });

  it("publishes a stopped progress clock while a replacement Player Page loads", async () => {
    const { provider, player } = fakeProvider("fake");
    const published: boolean[] = [];
    const queue = new SongQueue({
      providers: [provider],
      newId: () => "song-1",
      onChange: () => published.push(queue.editorPlayback().isPlaying),
    });
    player.connect();
    const one = songOf(await queue.request("fake:one@200"));
    player.load(one, 200);
    expect(published.at(-1)).toBe(true);

    // A replacement page becomes ready without disconnecting the old Player.
    player.connect();
    expect(published.at(-1)).toBe(false);

    player.load(one, 200);
    expect(published.at(-1)).toBe(true);
  });
});

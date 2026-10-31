import { StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { RequestSongSettings } from "song-requests-protocol";
import { describe, expect, it } from "vitest";

import type {
  Player,
  PlayerEvents,
  Playable,
  Provider,
  Song,
} from "../songs/provider";
import { SongQueue } from "../songs/song-queue";
import { RequestSongAction } from "./request-song";

/**
 * Claims `fake:<title>`, with `@<seconds>` after the title when it knows the
 * track's duration; refuses `fake:refuse`, and records what it was asked.
 */
function fakeProvider(player: Player) {
  const asked: string[] = [];
  const provider: Provider = {
    id: "fake",
    player,
    claims: (request) => request.startsWith("fake:"),
    async resolve(request) {
      asked.push(request);
      const [title, seconds] = request.slice("fake:".length).split("@");
      if (title === "refuse") return { kind: "refused", reason: "not-found" };
      return {
        kind: "track",
        track: {
          provider: "fake",
          trackId: title,
          title,
          channel: "Some Channel",
          channelUrl: "fake://channel",
          url: `fake://${title}`,
          duration: seconds === undefined ? undefined : Number(seconds),
        },
      };
    },
  };
  return { provider, asked };
}

function requestSong() {
  let playerEvents: PlayerEvents | undefined;
  let ready = false;
  const played: Playable[] = [];
  const started: Song[] = [];
  const player: Player = {
    get ready() {
      return ready;
    },
    play: (song) => played.push(song),
    unmute: () => {},
    stop: () => {},
    pause: () => {},
    resume: () => {},
    setVolume: () => {},
    attach: (events) => {
      playerEvents = events;
    },
  };
  const { provider, asked } = fakeProvider(player);
  let next = 0;
  const queue = new SongQueue({
    providers: [provider],
    newId: () => `song-${++next}`,
    onStarted: (song) => started.push(song),
  });
  const action = new RequestSongAction(queue);
  const run = (settings: Record<string, unknown>) =>
    action.onTrigger(
      new StandaloneTriggerContext<RequestSongSettings>(
        "instance",
        settings as RequestSongSettings,
      ),
    );
  const start = () => {
    ready = true;
    playerEvents?.ready();
    const song = played[0];
    if (!song) throw new Error("no Song played");
    playerEvents?.loaded(song.id, song.duration ?? 200);
  };
  return { run, asked, start, started, queue };
}

describe("Request Song", () => {
  it("inserts each Next Song first without interrupting playback", async () => {
    const { run, start, queue } = requestSong();
    await run({ request: "fake:current@100" });
    start();
    await run({ request: "fake:in-turn@100" });
    expect(
      await run({ request: "fake:first-next@100", position: "next" }),
    ).toMatchObject({ position: 1, eta: 100 });
    expect(
      await run({ request: "fake:second-next@100", position: "next" }),
    ).toMatchObject({ position: 1, eta: 100 });
    expect(queue.snapshot().current?.song.title).toBe("current");
    expect(queue.snapshot().waiting.map((song) => song.title)).toEqual([
      "second-next",
      "first-next",
      "in-turn",
    ]);
  });

  it("produces the accepted Song and its place for a chat reply", async () => {
    const { run } = requestSong();
    await run({ request: "fake:first" });

    expect(await run({ request: "  fake:second " })).toEqual({
      outcome: "accepted",
      songId: "song-2",
      title: "second",
      channel: "Some Channel",
      url: "fake://second",
      position: 2,
    });
  });

  it("produces the Song's duration and when it should start, once they are known", async () => {
    const { run } = requestSong();
    await run({ request: "fake:first@200" });

    expect(await run({ request: "fake:second@100" })).toEqual({
      outcome: "accepted",
      songId: "song-2",
      title: "second",
      channel: "Some Channel",
      url: "fake://second",
      position: 2,
      duration: 100,
      eta: 200,
    });
  });

  it("produces only the outcome and the reason for a refused Request", async () => {
    const { run } = requestSong();

    expect(await run({ request: "fake:refuse" })).toEqual({
      outcome: "refused",
      reason: "not-found",
    });
  });

  it("refuses an empty Request without asking any Provider", async () => {
    const { run, asked } = requestSong();

    expect(await run({})).toEqual({ outcome: "refused", reason: "not-found" });
    expect(await run({ request: "   " })).toEqual({
      outcome: "refused",
      reason: "not-found",
    });
    expect(asked).toEqual([]);
  });

  it("hands the Requester and Reference to the Song unchanged", async () => {
    const { run, start, started } = requestSong();

    await run({
      request: "fake:one@100",
      requesterPlatform: " twitch ",
      requesterId: 42,
      requesterName: false,
      reference: "  redemption-1  ",
    });
    start();

    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({
      requesterPlatform: " twitch ",
      requesterId: "42",
      requesterName: "false",
      reference: "  redemption-1  ",
    });
  });

  it("gives the streamer's own Request empty Requester and Reference fields", async () => {
    const { run, start, started } = requestSong();

    await run({ request: "fake:one@100" });
    start();

    expect(started[0]).toMatchObject({
      requesterPlatform: "",
      requesterId: "",
      requesterName: "",
      reference: "",
    });
  });

  it("reads a Request a Run Variable turned into a number", async () => {
    const { run, asked } = requestSong();

    await run({ request: 42 });

    // 42 is no one's link, so the default Provider gets it, as text.
    expect(asked).toEqual(["42"]);
  });

  it("answers by a step's Overrides, not the Defaults", async () => {
    const { run } = requestSong();

    // The Default ten minutes refuses this; the step allows twenty.
    expect(await run({ request: "fake:long@900" })).toEqual({
      outcome: "refused",
      reason: "too-long",
    });
    expect(
      await run({
        request: "fake:long@900",
        overrides: {
          longestDurationSeconds: { mode: "value", value: 1200 },
        },
      }),
    ).toMatchObject({ outcome: "accepted", duration: 900 });
    // The Override went no further than its own step.
    expect(await run({ request: "fake:long@900" })).toEqual({
      outcome: "refused",
      reason: "too-long",
    });
  });
});

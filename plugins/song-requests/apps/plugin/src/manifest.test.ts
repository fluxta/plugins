import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  SONG_DROPPED_EVENT,
  SONG_ENDED_EVENT,
  SONG_STARTED_EVENT,
  toSongDroppedPayload,
  toSongEndedPayload,
  toSongStartedPayload,
} from "./events";
import type { Song } from "./songs/provider";
import { SongQueue } from "./songs/song-queue";
import { createRequestsSource } from "./sources/requests";
import { createPlaybackSources } from "./sources/playback";
import { fakeProvider } from "./test-support/fake-provider";

type ManifestField = {
  key: string;
  name: string;
  type: "string" | "number" | "boolean";
};

/** Fluxta drops whatever the manifest does not declare, without a word. */
const manifest = JSON.parse(
  readFileSync(new URL("../../../manifest.json", import.meta.url), "utf8"),
) as {
  events: { type: string; name: string; fields: ManifestField[] }[];
  sources: (ManifestField & { resolve: string; context: string })[];
  actions: { type: string; produces: ManifestField[] }[];
};

const songFields: ManifestField[] = [
  { key: "songId", name: "Song ID", type: "string" },
  { key: "provider", name: "Provider", type: "string" },
  { key: "title", name: "Title", type: "string" },
  { key: "channel", name: "Channel", type: "string" },
  { key: "duration", name: "Duration (Seconds)", type: "number" },
  { key: "url", name: "Link", type: "string" },
  {
    key: "requesterPlatform",
    name: "Requester Platform",
    type: "string",
  },
  { key: "requesterId", name: "Requester ID", type: "string" },
  { key: "requesterName", name: "Requester Name", type: "string" },
  { key: "reference", name: "Reference", type: "string" },
];

const song: Song = {
  id: "song-1",
  provider: "fake",
  trackId: "track-1",
  title: "A Song",
  channel: "A Channel",
  channelUrl: "fake://channel",
  duration: 200,
  url: "fake://track-1",
  requesterPlatform: " twitch ",
  requesterId: "42",
  requesterName: "A Viewer",
  reference: "  redemption-1  ",
};

describe("manifest.json", () => {
  it("declares the registered playback and Requests Open values as Standalone Query Sources with matching types", async () => {
    const { provider } = fakeProvider();
    const queue = new SongQueue({ providers: [provider], newId: () => "song" });
    const sources = [
      ...createPlaybackSources(queue),
      createRequestsSource(queue),
    ];
    expect(manifest.sources.map(({ key, type }) => [key, type])).toEqual([
      ["isPlaying", "boolean"],
      ["isPaused", "boolean"],
      ["playerConnected", "boolean"],
      ["currentTitle", "string"],
      ["currentRequester", "string"],
      ["isFallback", "boolean"],
      ["queueLength", "number"],
      ["queueDuration", "number"],
      ["volume", "number"],
      ["requestsOpen", "boolean"],
    ]);
    expect(sources.map((source) => source.key)).toEqual(
      manifest.sources.map((source) => source.key),
    );
    for (const declaration of manifest.sources) {
      expect(declaration.resolve).toBe("query");
      expect(declaration.context).toBe("standalone");
      const source = sources.find((source) => source.key === declaration.key)!;
      expect(typeof (await source.resolve({ itemId: 0, args: {} }))).toBe(
        declaration.type,
      );
    }
  });

  it("declares each control Action's Run Variables", () => {
    expect(
      manifest.actions
        .slice(1)
        .map(({ type, produces }) => ({ type, produces })),
    ).toEqual([
      {
        type: "skip",
        produces: [{ key: "title", name: "Title", type: "string" }],
      },
      {
        type: "playback",
        produces: [{ key: "isPaused", name: "Is Paused", type: "boolean" }],
      },
      {
        type: "volume",
        produces: [{ key: "volume", name: "Volume", type: "number" }],
      },
      {
        type: "remove-song",
        produces: [
          { key: "removed", name: "Removed", type: "number" },
          { key: "title", name: "Title", type: "string" },
        ],
      },
      {
        type: "clear-queue",
        produces: [{ key: "removed", name: "Removed", type: "number" }],
      },
      {
        type: "block-song",
        produces: [{ key: "title", name: "Title", type: "string" }],
      },
      {
        type: "requests",
        produces: [{ key: "isOpen", name: "Is Open", type: "boolean" }],
      },
      {
        type: "get-song",
        produces: [
          ...songFields,
          { key: "position", name: "Position", type: "number" },
          { key: "eta", name: "Starts In (Seconds)", type: "number" },
        ],
      },
    ]);
  });
  it("declares exactly the Song Events the sidecar emits", () => {
    expect(manifest.events).toEqual([
      {
        type: SONG_STARTED_EVENT,
        name: "Song Started",
        fields: songFields,
      },
      {
        type: SONG_ENDED_EVENT,
        name: "Song Ended",
        fields: [...songFields, { key: "how", name: "How", type: "string" }],
      },
      {
        type: SONG_DROPPED_EVENT,
        name: "Song Dropped",
        fields: [...songFields, { key: "why", name: "Why", type: "string" }],
      },
    ]);
  });

  it("declares every payload field the sidecar emits, with its type", () => {
    const payloads = [
      toSongStartedPayload(song),
      toSongEndedPayload(song, "finished"),
      toSongDroppedPayload(song, "unavailable"),
    ];

    for (const [index, payload] of payloads.entries()) {
      const fields = manifest.events[index].fields;
      expect(Object.keys(payload)).toEqual(fields.map(({ key }) => key));

      for (const field of fields) {
        const value = (payload as Record<string, string | number>)[field.key];
        expect(typeof value).toBe(field.type);
      }
    }
  });

  it("hands the Requester and Reference back unchanged", () => {
    expect(toSongStartedPayload(song)).toEqual({
      songId: "song-1",
      provider: "fake",
      title: "A Song",
      channel: "A Channel",
      duration: 200,
      url: "fake://track-1",
      requesterPlatform: " twitch ",
      requesterId: "42",
      requesterName: "A Viewer",
      reference: "  redemption-1  ",
    });
  });

  it("leaves an unknown duration and the Provider's internals out of a drop", () => {
    const unknown = { ...song, duration: undefined };

    expect(toSongDroppedPayload(unknown, "unavailable")).toEqual({
      songId: "song-1",
      provider: "fake",
      title: "A Song",
      channel: "A Channel",
      url: "fake://track-1",
      requesterPlatform: " twitch ",
      requesterId: "42",
      requesterName: "A Viewer",
      reference: "  redemption-1  ",
      why: "unavailable",
    });
  });
});

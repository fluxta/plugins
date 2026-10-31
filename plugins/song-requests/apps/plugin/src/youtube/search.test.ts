import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  FALLBACK_RULE_DEFAULTS,
  type BlocklistEntry,
  type RuleDefaults,
  type RequestSongOverrides,
} from "song-requests-protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Player, Song } from "../songs/provider";
import { SongQueue, type SongQueueSnapshot } from "../songs/song-queue";
import { StateFile } from "../state-file";
import { DataApi, type Video } from "./data-api";
import { createYouTubeProvider } from "./provider";
import { SearchCache } from "./search-cache";

const FIRST = "dQw4w9WgXcQ";
const SECOND = "aqz-KE-bpKQ";
const THIRD = "M7lc1UVf-VE";
const FOURTH = "abcdefghijk";
const FIFTH = "lmnopqrstuv";
const KEY = "test-api-key";
const DAY = 24 * 60 * 60 * 1000;
const player: Player = {
  ready: false,
  play: () => {},
  unmute: () => {},
  stop: () => {},
  pause: () => {},
  resume: () => {},
  setVolume: () => {},
  attach: () => {},
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function results(...ids: string[]): Response {
  return json({ items: ids.map((videoId) => ({ id: { videoId } })) });
}

function video(id = FIRST, changes: Partial<Video> = {}): Video {
  return {
    id,
    snippet: { title: id, channelId: "channel", categoryId: "10" },
    contentDetails: { duration: "PT3M" },
    status: { embeddable: true, privacyStatus: "public" },
    ...changes,
  };
}

/** A real Provider and Song Queue, with only YouTube replaced by a fake fetch. */
function setup(
  answers: (Response | Error)[],
  {
    defaults = {},
    blocklist = [],
    initial,
    cache = new SearchCache(),
    key = KEY,
  }: {
    defaults?: Partial<RuleDefaults>;
    blocklist?: BlocklistEntry[];
    initial?: SongQueueSnapshot;
    cache?: SearchCache;
    key?: string;
  } = {},
) {
  const calls: { url: URL; key: string | null }[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: new URL(String(input)),
      key: new Headers(init?.headers).get("x-goog-api-key"),
    });
    const answer = answers.shift();
    if (!answer) throw new Error("no answer left");
    if (answer instanceof Error) throw answer;
    return answer;
  };
  const api = new DataApi({ fetch });
  api.setKey(key);
  const provider = createYouTubeProvider({
    fetch,
    dataApi: api,
    player,
    region: () => "DE",
    searchCache: cache,
  });
  let id = 0;
  const queue = new SongQueue({
    providers: [provider],
    newId: () => `song-${++id}`,
    initial,
    rules: {
      defaults: () => ({ ...FALLBACK_RULE_DEFAULTS, ...defaults }),
      blocklist: () => blocklist,
    },
  });
  return { queue, api, provider, calls, cache };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-30T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("Requests by search words", () => {
  it("skips long and age-restricted candidates and checks all five in one batch, in search order", async () => {
    const { queue, calls } = setup([
      results(FIRST, SECOND, THIRD, FOURTH, FIFTH),
      json({
        items: [
          video(THIRD),
          video(SECOND, {
            contentDetails: {
              duration: "PT3M",
              contentRating: { ytRating: "ytAgeRestricted" },
            },
          }),
          video(FIRST, { contentDetails: { duration: "PT20M" } }),
        ],
      }),
    ]);

    expect(await queue.request("  A SONG  ")).toMatchObject({
      kind: "accepted",
      song: { trackId: THIRD },
    });
    expect(calls).toHaveLength(2);
    expect(calls[0].url.pathname).toBe("/youtube/v3/search");
    expect(Object.fromEntries(calls[0].url.searchParams)).toEqual({
      part: "snippet",
      q: "a song",
      type: "video",
      videoEmbeddable: "true",
      videoSyndicated: "true",
      regionCode: "DE",
      maxResults: "5",
    });
    expect(calls[1].url.searchParams.get("id")).toBe(
      [FIRST, SECOND, THIRD, FOURTH, FIFTH].join(","),
    );
    expect(
      calls.every(
        (call) => call.key === KEY && !String(call.url).includes(KEY),
      ),
    ).toBe(true);
  });

  it("chooses the first passing candidate even when videos.list returns them in reverse order", async () => {
    const { queue } = setup([
      results(FIRST, SECOND),
      json({ items: [video(SECOND), video(FIRST)] }),
    ]);
    expect(await queue.request("song")).toMatchObject({
      song: { trackId: FIRST },
    });
  });

  it.each([
    [
      "too-long",
      [
        video(FIRST, { contentDetails: { duration: "PT20M" } }),
        video(SECOND, { status: { embeddable: false } }),
      ],
    ],
    [
      "age-restricted",
      [
        video(FIRST, {
          contentDetails: { contentRating: { ytRating: "ytAgeRestricted" } },
        }),
        video(SECOND, { contentDetails: { duration: "PT20M" } }),
      ],
    ],
    ["not-found", [video(SECOND, { status: { embeddable: false } })]],
  ] as const)(
    "returns the first candidate's reason (%s) when none passes",
    async (reason, items) => {
      const { queue, cache } = setup([results(FIRST, SECOND), json({ items })]);
      expect(await queue.request("song")).toEqual({ kind: "refused", reason });
      expect(cache.snapshot()).toEqual([]);
    },
  );

  it("refuses no results without spending a videos.list call", async () => {
    const { queue, calls } = setup([results()]);
    expect(await queue.request("nothing")).toEqual({
      kind: "refused",
      reason: "not-found",
    });
    expect(calls).toHaveLength(1);
  });

  it.each<
    [
      { defaults?: Partial<RuleDefaults>; overrides?: RequestSongOverrides },
      boolean,
    ]
  >([
    [{ defaults: { musicOnly: true } }, true],
    [{ overrides: { musicOnly: { mode: "value", value: true } } }, true],
    [
      {
        defaults: { musicOnly: true },
        overrides: { musicOnly: { mode: "off" } },
      },
      false,
    ],
    [
      {
        defaults: { musicOnly: true },
        overrides: { musicOnly: { mode: "value", value: false } },
      },
      false,
    ],
  ])(
    "uses Music only from the step's resolved Rules: %j",
    async ({ defaults, overrides }, musicOnly) => {
      const { queue, calls } = setup(
        [
          results(FIRST, SECOND),
          json({
            items: [
              video(FIRST, { snippet: { categoryId: "20" } }),
              video(SECOND),
            ],
          }),
        ],
        { defaults },
      );
      expect(
        await queue.request("song", undefined, { overrides }),
      ).toMatchObject({ song: { trackId: musicOnly ? SECOND : FIRST } });
      expect(calls[0].url.searchParams.get("videoCategoryId")).toBe(
        musicOnly ? "10" : null,
      );
    },
  );

  it("applies duration Overrides to every candidate", async () => {
    const { queue } = setup([
      results(FIRST, SECOND),
      json({
        items: [
          video(FIRST, { contentDetails: { duration: "PT20M" } }),
          video(SECOND),
        ],
      }),
    ]);
    expect(
      await queue.request("long song", undefined, {
        overrides: { longestDurationSeconds: { mode: "value", value: 1200 } },
      }),
    ).toMatchObject({ song: { trackId: FIRST } });
  });

  it.each(["waiting", "current", "history", "track block", "channel block"])(
    "checks %s for each candidate",
    async (where) => {
      const old: Song = {
        provider: "youtube",
        trackId: FIRST,
        title: "old",
        channel: "",
        channelUrl: "https://www.youtube.com/channel/blocked",
        url: "",
        duration: 180,
        id: "old",
        requesterPlatform: "",
        requesterId: "",
        requesterName: "",
        reference: "",
      };
      const initial: SongQueueSnapshot = {
        waiting: where === "waiting" ? [old] : [],
        history:
          where === "history"
            ? [{ song: old, how: "finished", at: Date.now() }]
            : [],
        ...(where === "current"
          ? {
              current: {
                song: old,
                atStartCheck: false,
                started: true,
                position: 0,
              },
            }
          : {}),
      };
      const blocklist: BlocklistEntry[] =
        where === "track block"
          ? [{ kind: "track", provider: "youtube", trackId: FIRST }]
          : where === "channel block"
            ? [{ kind: "channel", channelUrl: old.channelUrl }]
            : [];
      const { queue } = setup(
        [
          results(FIRST, SECOND),
          json({
            items: [
              video(FIRST, { snippet: { channelId: "blocked" } }),
              video(SECOND),
            ],
          }),
        ],
        { initial, blocklist },
      );
      expect(await queue.request("song")).toMatchObject({
        song: { trackId: SECOND },
      });
    },
  );

  it.each([
    [new TypeError("network down")],
    [new Response("not json")],
    [json({}, 503)],
    [results(FIRST), new TypeError("network down")],
  ])(
    "answers failed search/check calls without throwing",
    async (...answers) => {
      const { queue } = setup(answers);
      expect(await queue.request("song")).toEqual({
        kind: "refused",
        reason: "provider-unavailable",
      });
    },
  );
});

const spent = () =>
  json({ error: { errors: [{ reason: "quotaExceeded" }] } }, 403);

describe("search quota", () => {
  it("stops searching until midnight Pacific while links and cached searches keep working", async () => {
    const { queue, calls } = setup(
      [
        results(FIRST),
        json({ items: [video()] }),
        spent(),
        json({ items: [video(SECOND)] }),
        json({ items: [video()] }),
        results(THIRD),
        json({ items: [video(THIRD)] }),
      ],
      { defaults: { alreadyQueued: "allow" } },
    );
    expect(await queue.request("cached")).toMatchObject({ kind: "accepted" });
    expect(await queue.request("other")).toEqual({
      kind: "refused",
      reason: "quota-exhausted",
    });
    expect(await queue.request("other again")).toEqual({
      kind: "refused",
      reason: "quota-exhausted",
    });
    expect(calls).toHaveLength(3);
    expect(await queue.request(`https://youtu.be/${SECOND}`)).toMatchObject({
      kind: "accepted",
    });
    expect(await queue.request("CACHED")).toMatchObject({ kind: "accepted" });
    expect(calls).toHaveLength(5);
    vi.setSystemTime(new Date("2026-10-31T06:59:59Z"));
    expect(await queue.request("other")).toEqual({
      kind: "refused",
      reason: "quota-exhausted",
    });
    vi.setSystemTime(new Date("2026-10-31T07:00:00Z"));
    expect(await queue.request("other")).toMatchObject({
      song: { trackId: THIRD },
    });
    expect(calls).toHaveLength(7);
  });

  it("does not use even a cached id without a key", async () => {
    const cache = new SearchCache();
    cache.set("song", FIRST);
    const { queue, calls } = setup([], { cache, key: "" });
    expect(await queue.request("song")).toEqual({
      kind: "refused",
      reason: "no-api-key",
    });
    expect(calls).toEqual([]);
  });

  it("remembers a key refused by search", async () => {
    const { queue, calls } = setup([
      json({ error: { message: "API key not valid" } }, 400),
    ]);
    expect(await queue.request("song")).toEqual({
      kind: "refused",
      reason: "api-key-invalid",
    });
    expect(await queue.request("another song")).toEqual({
      kind: "refused",
      reason: "api-key-invalid",
    });
    expect(calls).toHaveLength(1);
  });

  it("refuses words when the videos quota is spent, without falling back to oEmbed", async () => {
    const { queue, calls } = setup([results(FIRST), spent()]);
    expect(await queue.request("song")).toEqual({
      kind: "refused",
      reason: "quota-exhausted",
    });
    expect(await queue.request("another song")).toEqual({
      kind: "refused",
      reason: "quota-exhausted",
    });
    expect(calls).toHaveLength(2);
  });
});

describe("the search cache", () => {
  it("normalizes case and whitespace, rechecks Rules and Playability, and never extends an entry on a hit", async () => {
    const { queue, calls, cache } = setup([
      results(FIRST),
      json({ items: [video()] }),
      json({ items: [video()] }),
      json({ items: [video(FIRST, { status: { embeddable: false } })] }),
      results(SECOND),
      json({ items: [video(SECOND)] }),
    ]);
    expect(await queue.request("  A\tSONG\n ")).toMatchObject({
      kind: "accepted",
    });
    vi.setSystemTime(Date.now() + 6 * DAY);
    expect(await queue.request("a song")).toEqual({
      kind: "refused",
      reason: "already-queued",
    });
    expect(await queue.request("A  Song")).toEqual({
      kind: "refused",
      reason: "not-embeddable",
    });
    expect(
      calls.filter((call) => call.url.pathname.endsWith("/search")),
    ).toHaveLength(1);
    vi.setSystemTime(Date.now() + DAY);
    expect(cache.snapshot()).toEqual([]);
    expect(await queue.request("a song")).toMatchObject({
      song: { trackId: SECOND },
    });
    expect(calls).toHaveLength(6);
  });

  it("survives a State file round trip, dropping expired entries on restart", async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "song-requests-search-"),
    );
    try {
      const file = new StateFile(path.join(dir, "state.json"));
      const { queue, cache } = setup([
        results(FIRST),
        json({ items: [video()] }),
      ]);
      await queue.request("a song");
      const initial = cache.snapshot();
      await file.save({
        ...queue.snapshot(),
        searchCache: [
          ...initial,
          { words: "old", videoId: THIRD, foundAt: Date.now() - 7 * DAY },
        ],
      });
      const restored = await new StateFile(path.join(dir, "state.json")).load();
      const reloadedCache = new SearchCache({
        initial: restored.snapshot?.searchCache,
      });
      expect(reloadedCache.snapshot()).toEqual(initial);
      const restarted = setup([json({ items: [video()] })], {
        initial: restored.snapshot,
        cache: reloadedCache,
        defaults: { alreadyQueued: "allow" },
      });
      expect(await restarted.queue.request(" A  SONG ")).toMatchObject({
        song: { trackId: FIRST },
      });
      expect(restarted.calls).toHaveLength(1);
      expect(restarted.calls[0].url.pathname).toBe("/youtube/v3/videos");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

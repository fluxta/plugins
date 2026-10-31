import { describe, expect, it } from "vitest";

import type { Player } from "../songs/provider";
import { DataApi, type Video } from "./data-api";
import { createYouTubeProvider } from "./provider";

const ID = "dQw4w9WgXcQ";
const LINK = `https://youtu.be/${ID}`;
const KEY = "AIzaSyTestKey-0123456789abcdefghijkl";

const idlePlayer: Player = {
  ready: false,
  play: () => {},
  unmute: () => {},
  stop: () => {},
  pause: () => {},
  resume: () => {},
  setVolume: () => {},
  attach: () => {},
};

type Answer = Response | Error;

/**
 * A `fetch` that answers `videos.list` with the next of `videos` and oEmbed
 * by the video id the request carries, and records which of them was asked.
 */
function youtube({
  videos = [],
  oEmbed = {},
}: {
  videos?: Answer[];
  oEmbed?: Record<string, Answer>;
}) {
  const asked: string[] = [];
  const fetch = async (input: string | URL | Request) => {
    const url = new URL(String(input));
    let answer: Answer | undefined;

    if (url.pathname === "/youtube/v3/videos") {
      asked.push(`videos.list ${url.searchParams.get("id")}`);
      answer = videos.shift();
    } else {
      const target = new URL(url.searchParams.get("url") ?? "");
      const id = target.searchParams.get("v") ?? "";
      asked.push(`oEmbed ${id}`);
      // A body reads only once, and oEmbed may be asked again.
      const given = oEmbed[id];
      answer = given instanceof Response ? given.clone() : given;
    }

    if (answer instanceof Error) throw answer;
    return answer ?? new Response("Not Found", { status: 404 });
  };
  return { fetch, asked };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A playable video as `videos.list` gives it (spike #3), with `changes` over it. */
function video(changes: {
  snippet?: Video["snippet"];
  contentDetails?: Video["contentDetails"];
  status?: Video["status"];
}): Video {
  return {
    id: ID,
    snippet: {
      title: "Rick Astley - Never Gonna Give You Up (Official Video)",
      channelId: "UCuAXFkgsw1L7xaCfnd5JJOw",
      channelTitle: "Rick Astley",
      liveBroadcastContent: "none",
      ...changes.snippet,
    },
    contentDetails: {
      duration: "PT3M33S",
      contentRating: {},
      ...changes.contentDetails,
    },
    status: { embeddable: true, privacyStatus: "public", ...changes.status },
  };
}

const RICK_OEMBED = {
  title: "Rick Astley - Never Gonna Give You Up",
  author_name: "Rick Astley",
  author_url: "https://www.youtube.com/@RickAstleyYT",
};

/** The YouTube Provider, with `key` set when given, checking for `region`. */
function provider(
  fetch: ReturnType<typeof youtube>["fetch"],
  { key = "", region = "US" } = {},
) {
  const dataApi = new DataApi({ fetch });
  dataApi.setKey(key);
  return createYouTubeProvider({
    fetch,
    player: idlePlayer,
    dataApi,
    region: () => region,
  });
}

describe("the YouTube Provider", () => {
  it("claims YouTube links and nothing else", () => {
    const youtubeProvider = provider(youtube({}).fetch);

    expect(youtubeProvider.claims(LINK)).toBe(true);
    expect(youtubeProvider.claims("never gonna give you up")).toBe(false);
    expect(youtubeProvider.claims(`https://example.com/watch?v=${ID}`)).toBe(
      false,
    );
  });
});

describe("the YouTube Provider with the API Key", () => {
  it("turns a link into a track with its duration, asking only the Data API", async () => {
    const { fetch, asked } = youtube({
      videos: [json({ items: [video({})] })],
    });

    expect(await provider(fetch, { key: KEY }).resolve(LINK)).toEqual({
      kind: "track",
      track: {
        provider: "youtube",
        trackId: ID,
        title: "Rick Astley - Never Gonna Give You Up (Official Video)",
        channel: "Rick Astley",
        channelId: "UCuAXFkgsw1L7xaCfnd5JJOw",
        channelUrl: "https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw",
        url: `https://www.youtube.com/watch?v=${ID}`,
        duration: 213,
      },
    });
    expect(asked).toEqual([`videos.list ${ID}`]);
  });

  it.each([
    ["PT45S", 45],
    ["PT1H2M3S", 3723],
    ["PT10M", 600],
    ["P1DT1S", 86401],
  ])("reads a duration of %s as %i seconds", async (duration, seconds) => {
    const { fetch } = youtube({
      videos: [json({ items: [video({ contentDetails: { duration } })] })],
    });

    expect(await provider(fetch, { key: KEY }).resolve(LINK)).toMatchObject({
      track: { duration: seconds },
    });
  });

  it("leaves a duration it cannot read unknown, for the Start Check", async () => {
    const { fetch } = youtube({
      videos: [json({ items: [video({ contentDetails: { duration: "" } })] })],
    });

    const resolution = await provider(fetch, { key: KEY }).resolve(LINK);

    expect(resolution.kind).toBe("track");
    expect(resolution.kind === "track" && resolution.track.duration).toBe(
      undefined,
    );
  });

  it.each<[string, Video[], string]>([
    ["missing", [], "not-found"],
    ["private", [video({ status: { privacyStatus: "private" } })], "not-found"],
    [
      "not embeddable",
      [video({ status: { embeddable: false } })],
      "not-embeddable",
    ],
    [
      "age-restricted",
      [
        video({
          contentDetails: { contentRating: { ytRating: "ytAgeRestricted" } },
        }),
      ],
      "age-restricted",
    ],
    [
      "blocked in the Region",
      [
        video({
          contentDetails: { regionRestriction: { blocked: ["DE", "US"] } },
        }),
      ],
      "region-blocked",
    ],
    [
      "allowed only elsewhere",
      [
        video({
          contentDetails: { regionRestriction: { allowed: ["DE", "FR"] } },
        }),
      ],
      "region-blocked",
    ],
    [
      "live",
      [
        video({
          snippet: { liveBroadcastContent: "live" },
          contentDetails: { duration: "P0D" },
        }),
      ],
      "live",
    ],
    [
      "a premiere",
      [
        video({
          snippet: { liveBroadcastContent: "upcoming" },
          contentDetails: { duration: "P0D" },
        }),
      ],
      "live",
    ],
  ])(
    "refuses a video that is %s, whatever oEmbed would say",
    async (_, items, reason) => {
      const { fetch, asked } = youtube({
        videos: [json({ items })],
        oEmbed: { [ID]: json(RICK_OEMBED) },
      });

      expect(await provider(fetch, { key: KEY }).resolve(LINK)).toEqual({
        kind: "refused",
        reason,
      });
      expect(asked).toEqual([`videos.list ${ID}`]);
    },
  );

  it("checks a region restriction against the Region", async () => {
    const restricted = video({
      contentDetails: {
        regionRestriction: { blocked: ["DE"], allowed: undefined },
      },
    });
    const allowedHere = video({
      contentDetails: { regionRestriction: { allowed: ["RU"] } },
    });
    const { fetch } = youtube({
      videos: [
        json({ items: [restricted] }),
        json({ items: [restricted] }),
        json({ items: [allowedHere] }),
      ],
    });

    expect(
      await provider(fetch, { key: KEY, region: "RU" }).resolve(LINK),
    ).toMatchObject({ kind: "track" });
    expect(
      await provider(fetch, { key: KEY, region: "DE" }).resolve(LINK),
    ).toEqual({ kind: "refused", reason: "region-blocked" });
    expect(
      await provider(fetch, { key: KEY, region: "RU" }).resolve(LINK),
    ).toMatchObject({ kind: "track" });
  });
});

describe("the YouTube Provider without a usable API Key", () => {
  it("turns a link into a track with oEmbed's title and channel, duration unknown", async () => {
    const { fetch, asked } = youtube({ oEmbed: { [ID]: json(RICK_OEMBED) } });

    expect(await provider(fetch).resolve(LINK)).toEqual({
      kind: "track",
      track: {
        provider: "youtube",
        trackId: ID,
        title: "Rick Astley - Never Gonna Give You Up",
        channel: "Rick Astley",
        channelUrl: "https://www.youtube.com/@RickAstleyYT",
        url: `https://www.youtube.com/watch?v=${ID}`,
      },
    });
    expect(asked).toEqual([`oEmbed ${ID}`]);
  });

  it.each([
    [400, "not-found"],
    [404, "not-found"],
    [401, "not-embeddable"],
    [403, "not-embeddable"],
    [500, "provider-unavailable"],
  ])("refuses a video oEmbed answers %i for as %s", async (status, reason) => {
    const { fetch } = youtube({
      oEmbed: { [ID]: new Response("", { status }) },
    });

    expect(await provider(fetch).resolve(LINK)).toEqual({
      kind: "refused",
      reason,
    });
  });

  it("checks links through oEmbed once YouTube refuses the key, and leaves the key alone", async () => {
    const { fetch, asked } = youtube({
      videos: [json(KEY_NOT_VALID, 400)],
      oEmbed: { [ID]: json(RICK_OEMBED) },
    });
    const youtubeProvider = provider(fetch, { key: KEY });

    expect(await youtubeProvider.resolve(LINK)).toMatchObject({
      kind: "track",
      track: { title: "Rick Astley - Never Gonna Give You Up" },
    });
    expect(await youtubeProvider.resolve(LINK)).toMatchObject({
      kind: "track",
    });
    expect(asked).toEqual([
      `videos.list ${ID}`,
      `oEmbed ${ID}`,
      `oEmbed ${ID}`,
    ]);
  });

  it("checks links through oEmbed once the key's units are spent", async () => {
    const { fetch, asked } = youtube({
      videos: [json(QUOTA_EXCEEDED, 403)],
      oEmbed: { [ID]: json(RICK_OEMBED) },
    });
    const youtubeProvider = provider(fetch, { key: KEY });

    expect(await youtubeProvider.resolve(LINK)).toMatchObject({
      kind: "track",
    });
    expect(await youtubeProvider.resolve(LINK)).toMatchObject({
      kind: "track",
    });
    expect(asked).toEqual([
      `videos.list ${ID}`,
      `oEmbed ${ID}`,
      `oEmbed ${ID}`,
    ]);
  });

  it("checks a link through oEmbed when the Data API does not answer", async () => {
    const { fetch, asked } = youtube({
      videos: [new TypeError("fetch failed")],
      oEmbed: { [ID]: json(RICK_OEMBED) },
    });

    expect(await provider(fetch, { key: KEY }).resolve(LINK)).toMatchObject({
      kind: "track",
    });
    expect(asked).toEqual([`videos.list ${ID}`, `oEmbed ${ID}`]);
  });

  it("refuses as provider-unavailable when neither the Data API nor oEmbed answers", async () => {
    const { fetch } = youtube({
      videos: [new Response("", { status: 503 })],
      oEmbed: { [ID]: new TypeError("fetch failed") },
    });

    expect(await provider(fetch, { key: KEY }).resolve(LINK)).toEqual({
      kind: "refused",
      reason: "provider-unavailable",
    });
    expect(await provider(fetch).resolve(LINK)).toEqual({
      kind: "refused",
      reason: "provider-unavailable",
    });
  });

  it.each([
    ["no key is set", [], "", "no-api-key"],
    [
      "YouTube refuses the key",
      [json(KEY_NOT_VALID, 400)],
      KEY,
      "api-key-invalid",
    ],
    [
      "the key's units are spent",
      [json(QUOTA_EXCEEDED, 403)],
      KEY,
      "quota-exhausted",
    ],
  ])("refuses search words when %s", async (_, videos, key, reason) => {
    const { fetch, asked } = youtube({ videos });
    const youtubeProvider = provider(fetch, { key });
    // A link first, so YouTube has had its say about the key.
    await youtubeProvider.resolve(LINK);
    asked.length = 0;

    expect(await youtubeProvider.resolve("never gonna give you up")).toEqual({
      kind: "refused",
      reason,
    });
    expect(asked).toEqual([]);
  });
});

const KEY_NOT_VALID = {
  error: {
    code: 400,
    message: "API key not valid. Please pass a valid API key.",
    errors: [{ domain: "global", reason: "badRequest" }],
    status: "INVALID_ARGUMENT",
  },
};

const QUOTA_EXCEEDED = {
  error: {
    code: 403,
    errors: [{ domain: "youtube.quota", reason: "quotaExceeded" }],
  },
};

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DataApi } from "./data-api";

const KEY = "AIzaSyTestKey-0123456789abcdefghijkl";
const ID = "dQw4w9WgXcQ";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A `fetch` that answers every call with the next of `answers`, and records each call. */
function youtube(...answers: (Response | Error)[]) {
  const calls: { url: URL; key: string | null }[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: new URL(String(input)),
      key: new Headers(init?.headers).get("x-goog-api-key"),
    });
    const answer = answers.shift() ?? new Error("no answer left");
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { fetch, calls };
}

describe("the Data API client", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists videos with the key in a header, never in the address", async () => {
    const video = { id: ID, snippet: { title: "Never Gonna Give You Up" } };
    const { fetch, calls } = youtube(json({ items: [video] }));
    const api = new DataApi({ fetch });
    api.setKey(KEY);

    expect(await api.videos([ID])).toEqual({ kind: "videos", videos: [video] });
    expect(calls).toHaveLength(1);
    expect(calls[0].url.origin + calls[0].url.pathname).toBe(
      "https://www.googleapis.com/youtube/v3/videos",
    );
    expect(calls[0].url.searchParams.get("id")).toBe(ID);
    expect(calls[0].url.searchParams.get("part")).toBe(
      "snippet,contentDetails,status",
    );
    expect(calls[0].key).toBe(KEY);
    expect(String(calls[0].url)).not.toContain(KEY);
  });

  it("asks nothing of YouTube without a key", async () => {
    const { fetch, calls } = youtube();
    const api = new DataApi({ fetch });

    expect(await api.videos([ID])).toEqual({
      kind: "unusable",
      reason: "no-api-key",
    });
    api.setKey("   ");
    expect(await api.videos([ID])).toEqual({
      kind: "unusable",
      reason: "no-api-key",
    });
    expect(calls).toEqual([]);
  });

  it("stops using a key YouTube refuses until it is changed", async () => {
    const { fetch, calls } = youtube(
      json(KEY_NOT_VALID, 400),
      json({ items: [] }),
    );
    const api = new DataApi({ fetch });
    api.setKey(KEY);

    expect(await api.videos([ID])).toEqual({
      kind: "unusable",
      reason: "api-key-invalid",
    });
    expect(await api.videos([ID])).toEqual({
      kind: "unusable",
      reason: "api-key-invalid",
    });
    expect(calls).toHaveLength(1);

    api.setKey("AIzaSyAnotherKey");
    expect(await api.videos([ID])).toEqual({ kind: "videos", videos: [] });
    expect(calls).toHaveLength(2);
  });

  it.each([
    ["the Data API is not enabled in its project", SERVICE_DISABLED],
    ["the key is restricted", REFERRER_BLOCKED],
  ])("takes a key as refused when %s", async (_, body) => {
    const { fetch } = youtube(json(body, 403));
    const api = new DataApi({ fetch });
    api.setKey(KEY);

    expect(await api.videos([ID])).toEqual({
      kind: "unusable",
      reason: "api-key-invalid",
    });
  });

  it("asks YouTube afresh about a key saved again, which may have been fixed since", async () => {
    const { fetch, calls } = youtube(
      json(SERVICE_DISABLED, 403),
      json({ items: [] }),
    );
    const api = new DataApi({ fetch });
    api.setKey(KEY);
    await api.videos([ID]);

    api.setKey(KEY);

    expect(await api.videos([ID])).toEqual({ kind: "videos", videos: [] });
    expect(calls).toHaveLength(2);
  });

  it("leaves the key alone once its units are spent, until midnight Pacific", async () => {
    // 03:00 in California, on Pacific Daylight Time (UTC-7).
    vi.setSystemTime(new Date("2026-10-27T10:00:00Z"));
    const { fetch, calls } = youtube(
      json(QUOTA_EXCEEDED, 403),
      json({ items: [] }),
    );
    const api = new DataApi({ fetch });
    api.setKey(KEY);

    expect(await api.videos([ID])).toEqual({
      kind: "unusable",
      reason: "quota-exhausted",
    });

    vi.setSystemTime(new Date("2026-10-28T06:59:59Z"));
    expect(await api.videos([ID])).toEqual({
      kind: "unusable",
      reason: "quota-exhausted",
    });
    expect(calls).toHaveLength(1);

    vi.setSystemTime(new Date("2026-10-28T07:00:00Z"));
    expect(await api.videos([ID])).toEqual({ kind: "videos", videos: [] });
    expect(calls).toHaveLength(2);
  });

  it.each([
    ["cannot be reached", new TypeError("fetch failed")],
    ["fails", new Response("", { status: 503 })],
    [
      "answers something that is not JSON",
      new Response("<html>", { status: 200 }),
    ],
    ["answers without items", json({ kind: "youtube#videoListResponse" })],
    [
      "refuses for another reason",
      json({ error: { code: 403, errors: [{ reason: "forbidden" }] } }, 403),
    ],
  ])("is unavailable when YouTube %s, and keeps the key", async (_, answer) => {
    const { fetch, calls } = youtube(answer, json({ items: [] }));
    const api = new DataApi({ fetch });
    api.setKey(KEY);

    expect(await api.videos([ID])).toEqual({ kind: "unavailable" });
    expect(await api.videos([ID])).toEqual({ kind: "videos", videos: [] });
    expect(calls).toHaveLength(2);
  });
});

describe("what the Data API client tells the Plugin Editor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("says whether a key is set and what YouTube said of it, showing it masked", async () => {
    const { fetch } = youtube(json({ items: [] }), json(KEY_NOT_VALID, 400));
    const api = new DataApi({ fetch });
    expect(api.status()).toEqual({ state: "none", masked: "" });

    api.setKey(KEY);
    expect(api.status()).toEqual({ state: "unchecked", masked: "••••ijkl" });

    await api.videos([ID]);
    expect(api.status()).toEqual({ state: "accepted", masked: "••••ijkl" });

    api.setKey("AIzaSyAnotherKey-wxyz");
    await api.videos([ID]);
    expect(api.status()).toEqual({ state: "refused", masked: "••••wxyz" });
    expect(JSON.stringify(api.status())).not.toContain("AIza");
  });

  it.each([
    // 13:00 on the last day of daylight time, which ends at 2 a.m.
    ["2026-10-31T20:00:00Z", "2026-11-01T07:00:00Z"],
    // 04:00 on the first day of standard time (UTC-8).
    ["2026-11-01T12:00:00Z", "2026-11-02T08:00:00Z"],
    // 12:00 on the last day of standard time, which ends at 2 a.m.
    ["2027-03-13T20:00:00Z", "2027-03-14T08:00:00Z"],
    // 23:30 on the first day of daylight time.
    ["2027-03-15T06:30:00Z", "2027-03-15T07:00:00Z"],
  ])("says units spent at %s come back at %s", async (spent, reset) => {
    vi.setSystemTime(new Date(spent));
    const { fetch } = youtube(json(QUOTA_EXCEEDED, 403));
    const api = new DataApi({ fetch });
    api.setKey(KEY);

    await api.videos([ID]);

    expect(api.status()).toEqual({
      state: "spent",
      masked: "••••ijkl",
      resetsAt: Date.parse(reset),
    });
  });

  it("tells of every change, the reset of the units included", async () => {
    vi.setSystemTime(new Date("2026-10-27T10:00:00Z"));
    const { fetch } = youtube(json(QUOTA_EXCEEDED, 403));
    const api = new DataApi({ fetch });
    const told: string[] = [];
    api.onStatusChange(() => told.push(api.status().state));

    api.setKey(KEY);
    await api.videos([ID]);
    expect(told).toEqual(["unchecked", "spent"]);

    vi.advanceTimersByTime(Date.parse("2026-10-28T07:00:00Z") - Date.now());
    expect(told).toEqual(["unchecked", "spent", "accepted"]);

    api.setKey("");
    expect(told.at(-1)).toBe("none");
  });

  it("holds what YouTube said of a key against that key only", async () => {
    let answer!: (response: Response) => void;
    const fetch = () => new Promise<Response>((resolve) => (answer = resolve));
    const api = new DataApi({ fetch });
    api.setKey(KEY);

    const asked = api.videos([ID]);
    api.setKey("AIzaSyAnotherKey-wxyz");
    answer(json(KEY_NOT_VALID, 400));

    expect(await asked).toEqual({
      kind: "unusable",
      reason: "api-key-invalid",
    });
    expect(api.status()).toEqual({ state: "unchecked", masked: "••••wxyz" });
  });

  it("checks a new key with one call of a single unit", async () => {
    const { fetch, calls } = youtube(json({ items: [] }));
    const api = new DataApi({ fetch });

    await api.check();
    api.setKey(KEY);
    await api.check();
    await api.check();

    expect(calls).toHaveLength(1);
    expect(calls[0].url.searchParams.get("part")).toBe("id");
    expect(calls[0].key).toBe(KEY);
    expect(api.status().state).toBe("accepted");
  });
});

/** What YouTube answers once the day's 10,000 units are spent. */
const QUOTA_EXCEEDED = {
  error: {
    code: 403,
    message:
      'The request cannot be completed because you have exceeded your <a href="/youtube/v3/getting-started#quota">quota</a>.',
    errors: [
      {
        message:
          'The request cannot be completed because you have exceeded your <a href="/youtube/v3/getting-started#quota">quota</a>.',
        domain: "youtube.quota",
        reason: "quotaExceeded",
      },
    ],
  },
};

/** What YouTube answers a key whose project has not enabled the YouTube Data API v3. */
const SERVICE_DISABLED = {
  error: {
    code: 403,
    message:
      "YouTube Data API v3 has not been used in project 123456789 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/youtube.googleapis.com/overview?project=123456789 then retry.",
    errors: [{ domain: "usageLimits", reason: "accessNotConfigured" }],
    status: "PERMISSION_DENIED",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.ErrorInfo",
        reason: "SERVICE_DISABLED",
        domain: "googleapis.com",
      },
    ],
  },
};

/** What YouTube answers a key restricted to websites, called from the sidecar. */
const REFERRER_BLOCKED = {
  error: {
    code: 403,
    message: "Requests from referer <empty> are blocked.",
    errors: [{ domain: "global", reason: "forbidden" }],
    status: "PERMISSION_DENIED",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.ErrorInfo",
        reason: "API_KEY_HTTP_REFERRER_BLOCKED",
        domain: "googleapis.com",
      },
    ],
  },
};

/** What YouTube answers a key that is not valid (spike #3, and again in October 2026). */
const KEY_NOT_VALID = {
  error: {
    code: 400,
    message: "API key not valid. Please pass a valid API key.",
    errors: [
      {
        message: "API key not valid. Please pass a valid API key.",
        domain: "global",
        reason: "badRequest",
      },
    ],
    status: "INVALID_ARGUMENT",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.ErrorInfo",
        reason: "API_KEY_INVALID",
        domain: "googleapis.com",
        metadata: { service: "youtube.googleapis.com" },
      },
    ],
  },
};

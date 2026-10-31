import {
  FALLBACK_RULE_DEFAULTS,
  type RuleDefaults,
} from "song-requests-protocol";
import { describe, expect, it } from "vitest";

import type { Song, Track } from "./provider";
import { checkRules, durationBoundsOf, resolveRules } from "./rules";

const defaults: RuleDefaults = { ...FALLBACK_RULE_DEFAULTS };

function track(changes: Partial<Track> = {}): Track {
  return {
    provider: "fake",
    trackId: "one",
    title: "One",
    channel: "Fake channel",
    channelUrl: "fake://channel",
    url: "fake://one",
    ...changes,
  };
}

function waitingOf(...songs: Song[]): Song[] {
  return songs;
}

function songOf(track: Track, id = "song-1"): Song {
  return {
    ...track,
    requesterPlatform: "twitch",
    requesterId: "u1",
    requesterName: "viewer",
    reference: "",
    id,
  };
}

describe("how an Override is resolved", () => {
  it("follows the Default without an Override, and at its explicit `default` mode", () => {
    expect(resolveRules(undefined, defaults)).toEqual({
      requestsOpen: true,
      longestDurationSeconds: 600,
      shortestDurationSeconds: undefined,
      waitingPerRequester: 3,
      queueSize: 50,
      refuseAlreadyQueued: true,
      playedWithinSeconds: 3600,
      enforceBlocklist: true,
      musicOnly: false,
    });
    expect(
      resolveRules(
        {
          longestDurationSeconds: { mode: "default" },
          musicOnly: { mode: "default" },
        },
        defaults,
      ).longestDurationSeconds,
    ).toBe(600);
  });

  it("takes a value of its own at `value` mode", () => {
    const resolved = resolveRules(
      {
        requestsOpen: { mode: "value", value: false },
        longestDurationSeconds: { mode: "value", value: 1200 },
        shortestDurationSeconds: { mode: "value", value: 30 },
        waitingPerRequester: { mode: "value", value: 1 },
        queueSize: { mode: "value", value: 10 },
        alreadyQueued: { mode: "value", value: "allow" },
        playedWithinSeconds: { mode: "value", value: 0 },
        musicOnly: { mode: "value", value: true },
      },
      defaults,
    );

    expect(resolved).toEqual({
      requestsOpen: false,
      longestDurationSeconds: 1200,
      shortestDurationSeconds: 30,
      waitingPerRequester: 1,
      queueSize: 10,
      refuseAlreadyQueued: false,
      playedWithinSeconds: 0,
      enforceBlocklist: true,
      musicOnly: true,
    });
  });

  it("checks nothing at `off` mode, Requests Open included", () => {
    const resolved = resolveRules(
      {
        requestsOpen: { mode: "off" },
        longestDurationSeconds: { mode: "off" },
        waitingPerRequester: { mode: "off" },
        queueSize: { mode: "off" },
        alreadyQueued: { mode: "off" },
        playedWithinSeconds: { mode: "off" },
        blocklist: { mode: "off" },
        musicOnly: { mode: "off" },
      },
      { ...defaults, requestsOpen: false, musicOnly: true },
    );

    expect(resolved).toEqual({
      // "Do not check" Requests Open means the step never refuses as
      // `closed` — open, since that is the rule's only refusal.
      requestsOpen: true,
      longestDurationSeconds: undefined,
      shortestDurationSeconds: undefined,
      waitingPerRequester: undefined,
      queueSize: undefined,
      refuseAlreadyQueued: false,
      playedWithinSeconds: 0,
      enforceBlocklist: false,
      musicOnly: false,
    });
  });

  it("falls back to the Default when an Override holds no usable value", () => {
    const resolved = resolveRules(
      {
        // A setting arrives over the wire and is not trusted.
        longestDurationSeconds: { mode: "value", value: -5 },
        waitingPerRequester: { mode: "value", value: "many" } as never,
        alreadyQueued: { mode: "value", value: "maybe" } as never,
      },
      defaults,
    );

    expect(resolved.longestDurationSeconds).toBe(600);
    expect(resolved.waitingPerRequester).toBe(3);
    expect(resolved.refuseAlreadyQueued).toBe(true);
  });
});

describe("the Rules at their Defaults", () => {
  const context = (changes: Parameters<typeof checkRules>[1]) => changes;

  it("refuses as `closed` when Requests are closed", () => {
    const closed = resolveRules(
      { requestsOpen: { mode: "value", value: false } },
      defaults,
    );

    expect(checkRules(closed, context({ track: track() }))).toBe("closed");
    expect(
      checkRules(
        resolveRules(undefined, defaults),
        context({ track: track() }),
      ),
    ).toBe(undefined);
  });

  it("refuses a too-long and a too-short track when its duration is known", () => {
    const rules = resolveRules(undefined, defaults);

    expect(
      checkRules(rules, context({ track: track({ duration: 601 }) })),
    ).toBe("too-long");
    expect(
      checkRules(rules, context({ track: track({ duration: 600 }) })),
    ).toBe(undefined);
    expect(
      checkRules(
        resolveRules(
          { shortestDurationSeconds: { mode: "value", value: 60 } },
          defaults,
        ),
        context({ track: track({ duration: 30 }) }),
      ),
    ).toBe("too-short");
  });

  it("counts a Requester's waiting Songs by platform and id", () => {
    const rules = resolveRules(undefined, defaults);
    const mine = songOf(track());
    const context = {
      track: track({ trackId: "two", url: "fake://two" }),
      requester: { requesterPlatform: "twitch", requesterId: "u1" },
      waiting: waitingOf(mine, mine, { ...mine, id: "song-4" }),
    };

    expect(checkRules(rules, context)).toBe("requester-limit");
    // Another Requester is not limited by mine.
    expect(
      checkRules(rules, {
        ...context,
        requester: { requesterPlatform: "twitch", requesterId: "u2" },
      }),
    ).toBe(undefined);
    // The same id on another Platform is someone else.
    expect(
      checkRules(rules, {
        ...context,
        requester: { requesterPlatform: "youtube", requesterId: "u1" },
      }),
    ).toBe(undefined);
  });

  it("does not count a Request without an id", () => {
    const rules = resolveRules(undefined, defaults);
    const mine = songOf(track());

    expect(
      checkRules(rules, {
        track: track({ trackId: "two" }),
        requester: { requesterPlatform: "", requesterId: "" },
        waiting: waitingOf(mine, mine, mine, mine),
      }),
    ).toBe(undefined);
  });

  it("refuses as `queue-full` at the Default queue size", () => {
    const rules = resolveRules(undefined, defaults);
    const waiting = Array.from({ length: 50 }, (_, i) =>
      songOf(track({ trackId: `t${i}` }), `song-${i}`),
    );

    expect(
      checkRules(rules, {
        track: track({ trackId: "new" }),
        requester: { requesterPlatform: "", requesterId: "" },
        waiting,
      }),
    ).toBe("queue-full");
  });

  it("refuses a track already waiting or on air as `already-queued`", () => {
    const rules = resolveRules(undefined, defaults);
    const one = songOf(track());

    expect(
      checkRules(rules, {
        track: track(),
        requester: { requesterPlatform: "", requesterId: "" },
        waiting: waitingOf(one),
      }),
    ).toBe("already-queued");
    expect(
      checkRules(rules, {
        track: track(),
        requester: { requesterPlatform: "", requesterId: "" },
        waiting: [],
        current: one,
      }),
    ).toBe("already-queued");
    expect(
      checkRules(
        resolveRules(
          { alreadyQueued: { mode: "value", value: "allow" } },
          defaults,
        ),
        {
          track: track(),
          requester: { requesterPlatform: "", requesterId: "" },
          waiting: waitingOf(one),
        },
      ),
    ).toBe(undefined);
  });

  it("refuses a track that played within the window as `recently-played`", () => {
    const now = 1_760_000_000_000;
    const rules = resolveRules(undefined, defaults);
    const played = {
      song: songOf(track()),
      how: "finished" as const,
      at: now - 3_599_000,
    };

    expect(
      checkRules(rules, {
        track: track(),
        requester: { requesterPlatform: "", requesterId: "" },
        history: [played],
        now,
      }),
    ).toBe("recently-played");
    // A second longer ago is outside the Default hour.
    expect(
      checkRules(rules, {
        track: track(),
        requester: { requesterPlatform: "", requesterId: "" },
        history: [{ ...played, at: now - 3_601_000 }],
        now,
      }),
    ).toBe(undefined);
    // Another track is not the one that played.
    expect(
      checkRules(rules, {
        track: track({ trackId: "other" }),
        requester: { requesterPlatform: "", requesterId: "" },
        history: [played],
        now,
      }),
    ).toBe(undefined);
  });

  it("refuses a blocked track by its Provider and id, a blocked channel by its address", () => {
    const rules = resolveRules(undefined, defaults);
    const blocklist = [
      { kind: "track" as const, provider: "fake", trackId: "one" },
      { kind: "channel" as const, channelUrl: "fake://blocked" },
    ];

    expect(
      checkRules(rules, {
        track: track(),
        requester: { requesterPlatform: "", requesterId: "" },
        blocklist,
      }),
    ).toBe("blocked");
    // The channel match is by the address a track carries — the one oEmbed
    // gives when there is no API Key (ADR-0005).
    expect(
      checkRules(rules, {
        track: track({ trackId: "other", channelUrl: "fake://blocked" }),
        requester: { requesterPlatform: "", requesterId: "" },
        blocklist,
      }),
    ).toBe("blocked");
    expect(
      checkRules(resolveRules({ blocklist: { mode: "off" } }, defaults), {
        track: track(),
        requester: { requesterPlatform: "", requesterId: "" },
        blocklist,
      }),
    ).toBe(undefined);
  });

  it("refuses what is not music only where its Provider said, as `not-music`", () => {
    const rules = resolveRules(
      { musicOnly: { mode: "value", value: true } },
      defaults,
    );

    expect(
      checkRules(rules, {
        track: track({ music: false }),
        requester: { requesterPlatform: "", requesterId: "" },
      }),
    ).toBe("not-music");
    // Without the API Key the Provider could not say: not checked.
    expect(
      checkRules(rules, {
        track: track({ music: undefined }),
        requester: { requesterPlatform: "", requesterId: "" },
      }),
    ).toBe(undefined);
  });
});

describe("the duration bounds a Song travels with", () => {
  it("is the resolved longest and shortest, each absent when not checked", () => {
    expect(durationBoundsOf(resolveRules(undefined, defaults))).toEqual({
      maxSeconds: 600,
    });
    expect(
      durationBoundsOf(
        resolveRules(
          {
            longestDurationSeconds: { mode: "off" },
            shortestDurationSeconds: { mode: "value", value: 30 },
          },
          defaults,
        ),
      ),
    ).toEqual({ minSeconds: 30 });
    expect(
      durationBoundsOf(
        resolveRules(
          {
            longestDurationSeconds: { mode: "off" },
            shortestDurationSeconds: { mode: "off" },
          },
          { ...defaults, shortestDurationSeconds: 15 },
        ),
      ),
    ).toBe(undefined);
  });
});

describe("channel identity in the Blocklist", () => {
  it("uses a channel id when both sides know it, otherwise falls back to its address", () => {
    const rules = resolveRules(undefined, defaults);
    const entry = {
      kind: "channel" as const,
      provider: "fake",
      channelId: "stable",
      channelUrl: "fake://old-address",
    };
    const reason = (changes: Partial<Track>) =>
      checkRules(rules, { track: track(changes), blocklist: [entry] });
    expect(
      reason({ channelId: "stable", channelUrl: "fake://new-address" }),
    ).toBe("blocked");
    expect(
      reason({ channelId: "different", channelUrl: "fake://old-address" }),
    ).toBeUndefined();
    expect(reason({ channelUrl: "fake://old-address" })).toBe("blocked");
    expect(
      reason({
        provider: "other",
        channelId: "stable",
        channelUrl: "fake://old-address",
      }),
    ).toBeUndefined();
  });
});

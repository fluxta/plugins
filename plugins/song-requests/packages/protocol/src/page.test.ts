import { describe, expect, it } from "vitest";

import { isPageMessage, isSidecarMessage } from "./page";

describe("the Player Page's messages", () => {
  it("checks actual playback state and position from the Player", () => {
    for (const state of ["playing", "paused", "buffering", "loading"]) {
      expect(
        isPageMessage({
          event: "playback",
          songId: "s1",
          state,
          position: 12.5,
        }),
      ).toBe(true);
    }
    for (const position of [-1, Infinity, NaN, "12", undefined]) {
      expect(
        isPageMessage({
          event: "playback",
          songId: "s1",
          state: "paused",
          position,
        }),
      ).toBe(false);
    }
    expect(
      isPageMessage({ event: "playback", state: "playing", position: 0 }),
    ).toBe(false);
    expect(
      isPageMessage({
        event: "playback",
        songId: "s1",
        state: "unknown",
        position: 0,
      }),
    ).toBe(false);
  });
  it("checks playback and volume commands, including paused loads and silent volume", () => {
    expect(isSidecarMessage({ event: "pause" })).toBe(true);
    expect(isSidecarMessage({ event: "resume" })).toBe(true);
    expect(isSidecarMessage({ event: "volume", volume: 0 })).toBe(true);
    expect(
      isSidecarMessage({
        event: "load",
        songId: "s1",
        videoId: "video",
        muted: false,
        startAt: 12,
        paused: true,
        volume: 25,
      }),
    ).toBe(true);
    for (const volume of [-1, 101, 1.5, "50", null]) {
      expect(isSidecarMessage({ event: "volume", volume })).toBe(false);
    }
    expect(isSidecarMessage({ event: "volume" })).toBe(false);
    expect(
      isSidecarMessage({
        event: "load",
        songId: "s1",
        videoId: "video",
        muted: false,
        startAt: 0,
        paused: "true",
      }),
    ).toBe(false);
  });
  it("accepts a page saying a Song plays, ended or could not play", () => {
    expect(
      isPageMessage({
        event: "loaded",
        songId: "s1",
        duration: 213.1,
        live: false,
      }),
    ).toBe(true);
    expect(isPageMessage({ event: "ended", songId: "s1" })).toBe(true);
    expect(isPageMessage({ event: "error", songId: "s1", code: 150 })).toBe(
      true,
    );
    expect(
      isPageMessage({
        event: "loaded",
        songId: "s1",
        duration: 213,
        live: false,
        title: "Never Gonna Give You Up",
      }),
    ).toBe(true);
    expect(
      isPageMessage({
        event: "cued",
        requestId: "1",
        ids: ["dQw4w9WgXcQ", "video"],
      }),
    ).toBe(true);
  });

  it("refuses anything else a page might send", () => {
    expect(isPageMessage({ event: "ended" })).toBe(false);
    expect(isPageMessage({ event: "error", songId: "s1", code: "150" })).toBe(
      false,
    );
    expect(isPageMessage({ event: "load", songId: "s1" })).toBe(false);
    expect(
      isPageMessage({ event: "loaded", songId: "s1", duration: 213 }),
    ).toBe(false);
    expect(isPageMessage("ended")).toBe(false);
    expect(isPageMessage(null)).toBe(false);
  });

  it("accepts the sidecar telling a page to load a video, unmute it or stop", () => {
    expect(
      isSidecarMessage({
        event: "load",
        songId: "s1",
        videoId: "dQw4w9WgXcQ",
        muted: true,
        startAt: 42,
      }),
    ).toBe(true);
    expect(isSidecarMessage({ event: "unmute", songId: "s1" })).toBe(true);
    expect(isSidecarMessage({ event: "stop" })).toBe(true);
    expect(
      isSidecarMessage({ event: "cue", requestId: "1", playlistId: "PL…" }),
    ).toBe(true);
    expect(isSidecarMessage({ event: "cue", playlistId: "PL…" })).toBe(false);
    expect(isPageMessage({ event: "cued", ids: [] })).toBe(false);
    expect(isSidecarMessage({ event: "cue" })).toBe(false);

    expect(
      isSidecarMessage({
        event: "load",
        songId: "s1",
        videoId: "dQw4w9WgXcQ",
        muted: true,
      }),
    ).toBe(false);
    expect(isSidecarMessage({ event: "unmute" })).toBe(false);
    expect(isSidecarMessage({ event: "ended", songId: "s1" })).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { isEditorMessage, isPluginMessage } from "./editor";

describe("the editors' messages", () => {
  it("accepts an editor asking how the plugin stands", () => {
    expect(isEditorMessage({ event: "get-status" })).toBe(true);
    expect(isEditorMessage({ event: "status" })).toBe(false);
    expect(isEditorMessage({})).toBe(false);
  });

  it("accepts an editor setting the API Key, or removing it", () => {
    expect(isEditorMessage({ event: "set-api-key", apiKey: "AIza…" })).toBe(
      true,
    );
    expect(isEditorMessage({ event: "set-api-key", apiKey: "" })).toBe(true);
    expect(isEditorMessage({ event: "set-api-key" })).toBe(false);
    expect(
      isEditorMessage({ event: "set-api-key", apiKey: "x".repeat(1000) }),
    ).toBe(false);
  });

  it("accepts an editor picking a Region, or going back to the computer's", () => {
    expect(isEditorMessage({ event: "set-region", region: "DE" })).toBe(true);
    expect(isEditorMessage({ event: "set-region", region: null })).toBe(true);
    expect(isEditorMessage({ event: "set-region", region: "Germany" })).toBe(
      false,
    );
  });

  it("accepts an editor setting the Rules' Defaults", () => {
    expect(
      isEditorMessage({
        event: "set-rule-defaults",
        defaults: { longestDurationSeconds: 900 },
      }),
    ).toBe(true);
    expect(
      isEditorMessage({
        event: "set-rule-defaults",
        defaults: { longestDurationSeconds: "forever" },
      }),
    ).toBe(false);
    expect(isEditorMessage({ event: "set-rule-defaults" })).toBe(false);
  });

  it("accepts an editor removing a Blocklist entry", () => {
    expect(
      isEditorMessage({
        event: "remove-blocklist-entry",
        entry: { kind: "track", provider: "youtube", trackId: "x" },
      }),
    ).toBe(true);
    expect(
      isEditorMessage({
        event: "remove-blocklist-entry",
        entry: { kind: "channel", channelUrl: "https://www.youtube.com/@x" },
      }),
    ).toBe(true);
    expect(
      isEditorMessage({
        event: "remove-blocklist-entry",
        entry: { kind: "channel" },
      }),
    ).toBe(false);
  });

  it("accepts an editor setting the Fallback Playlist, or removing it", () => {
    expect(
      isEditorMessage({
        event: "set-fallback-playlist",
        playlist: "https://www.youtube.com/playlist?list=PLx0sYbCqOb8",
      }),
    ).toBe(true);
    expect(
      isEditorMessage({ event: "set-fallback-playlist", playlist: "" }),
    ).toBe(true);
    expect(isEditorMessage({ event: "set-fallback-playlist" })).toBe(false);
    expect(
      isEditorMessage({
        event: "set-fallback-playlist",
        playlist: "x".repeat(1000),
      }),
    ).toBe(false);
  });

  it("accepts an editor replacing the Player Key", () => {
    expect(isEditorMessage({ event: "replace-player-key" })).toBe(true);
  });

  it("accepts an editor setting the Player Page's port", () => {
    expect(isEditorMessage({ event: "set-player-port", port: 29362 })).toBe(
      true,
    );
    expect(isEditorMessage({ event: "set-player-port", port: 1 })).toBe(true);
    expect(isEditorMessage({ event: "set-player-port", port: 0 })).toBe(false);
    expect(isEditorMessage({ event: "set-player-port", port: 65536 })).toBe(
      false,
    );
    expect(isEditorMessage({ event: "set-player-port", port: 1.5 })).toBe(
      false,
    );
    expect(isEditorMessage({ event: "set-player-port" })).toBe(false);
  });

  it("accepts a channel's Provider id when removing its Blocklist entry", () => {
    const entry = {
      kind: "channel",
      provider: "fake",
      channelId: "channel-1",
      channelUrl: "fake://channel",
    };
    expect(isEditorMessage({ event: "remove-blocklist-entry", entry })).toBe(
      true,
    );
  });

  it("accepts the status the sidecar sends, and nothing short of it", () => {
    const status = {
      playerUrl: "http://localhost:29362/player?key=k",
      playerPort: 29362,
      playerConnected: true,
      apiKey: { state: "spent", masked: "••••ijkl", resetsAt: 1793257200000 },
      region: { chosen: null, system: "US" },
      stateFile: { recovered: false },
      defaults: {
        requestsOpen: true,
        longestDurationSeconds: 600,
        waitingPerRequester: 3,
        queueSize: 50,
        alreadyQueued: "refuse",
        playedWithinSeconds: 3600,
        musicOnly: false,
      },
      blocklist: [
        { kind: "track", provider: "youtube", trackId: "x" },
        { kind: "channel", channelUrl: "https://www.youtube.com/@x" },
      ],
      fallbackPlaylist: "https://www.youtube.com/playlist?list=PLx0sYbCqOb8",
      history: [
        {
          id: "song-0",
          title: "gone",
          channel: "fake channel",
          url: "fake://gone",
          requesterName: "viewer",
          duration: 180,
          how: "finished",
          at: 1735689600000,
        },
      ],
      playback: {
        now: 1735689600000,
        isPlaying: true,
        isPaused: false,
        playerState: "playing",
        volume: 80,
        requestsOpen: true,
        current: {
          id: "song-1",
          title: "one",
          channel: "fake channel",
          url: "fake://one",
          requesterName: "viewer",
          isFallback: false,
          duration: 180,
          position: 12,
          atStartCheck: false,
        },
        waiting: [
          {
            id: "song-2",
            title: "two",
            channel: "fake channel",
            url: "fake://two",
            requesterName: "viewer",
            duration: null,
            eta: null,
          },
        ],
      },
    };

    expect(isPluginMessage({ event: "status", status })).toBe(true);
    expect(
      isPluginMessage({
        event: "status",
        status: {
          ...status,
          playback: { ...status.playback, isPlaying: false },
        },
      }),
    ).toBe(true);
    expect(
      isPluginMessage({
        event: "status",
        status: {
          ...status,
          playback: { ...status.playback, isPlaying: "playing" },
        },
      }),
    ).toBe(false);
    expect(
      isPluginMessage({ event: "status", status: { playerConnected: true } }),
    ).toBe(false);
    expect(
      isPluginMessage({
        event: "status",
        status: { ...status, playerPort: "29362" },
      }),
    ).toBe(false);
    expect(
      isPluginMessage({
        event: "status",
        status: Object.fromEntries(
          Object.entries(status).filter(([key]) => key !== "playerPort"),
        ),
      }),
    ).toBe(false);
    expect(
      isPluginMessage({
        event: "status",
        status: { ...status, apiKey: { state: "lost", masked: "" } },
      }),
    ).toBe(false);
    expect(
      isPluginMessage({
        event: "status",
        status: {
          ...status,
          playback: { ...status.playback, waiting: [{ id: "x" }] },
        },
      }),
    ).toBe(false);
    expect(
      isPluginMessage({
        event: "status",
        status: {
          ...status,
          history: [{ ...status.history[0], how: "vanished" }],
        },
      }),
    ).toBe(false);
    expect(isPluginMessage({ event: "get-status" })).toBe(false);
  });

  it("accepts the Now and the queue controls, and nothing short of them", () => {
    expect(isEditorMessage({ event: "playback", mode: "toggle" })).toBe(true);
    expect(isEditorMessage({ event: "playback", mode: "hold" })).toBe(false);
    expect(isEditorMessage({ event: "skip" })).toBe(true);
    expect(isEditorMessage({ event: "set-volume", volume: 50 })).toBe(true);
    expect(isEditorMessage({ event: "set-volume", volume: 101 })).toBe(false);
    expect(isEditorMessage({ event: "set-requests-open", open: false })).toBe(
      true,
    );
    expect(
      isEditorMessage({ event: "reorder-song", songId: "x", toPosition: 2 }),
    ).toBe(true);
    expect(
      isEditorMessage({ event: "reorder-song", songId: "x", toPosition: 0 }),
    ).toBe(false);
    expect(isEditorMessage({ event: "move-song-next", songId: "x" })).toBe(
      true,
    );
    expect(isEditorMessage({ event: "remove-song", songId: "x" })).toBe(true);
    expect(isEditorMessage({ event: "block-song", songId: "x" })).toBe(true);
    expect(isEditorMessage({ event: "queue-again", songId: "x" })).toBe(true);
    expect(isEditorMessage({ event: "queue-again" })).toBe(false);
    expect(
      isEditorMessage({
        event: "block-history-song",
        songId: "x",
        kind: "track",
      }),
    ).toBe(true);
    expect(
      isEditorMessage({
        event: "block-history-song",
        songId: "x",
        kind: "channel",
      }),
    ).toBe(true);
    expect(isEditorMessage({ event: "block-history-song", songId: "x" })).toBe(
      false,
    );
    expect(
      isEditorMessage({ event: "block-history-song", songId: "x", kind: 1 }),
    ).toBe(false);
    expect(
      isEditorMessage({ event: "request-song", request: "fake:one" }),
    ).toBe(true);
    expect(isEditorMessage({ event: "request-song", request: "" })).toBe(false);
  });

  it("accepts the answer to the History's Queue again", () => {
    expect(
      isPluginMessage({
        event: "queue-again-answer",
        songId: "song-0",
        answer: { kind: "accepted", position: 1, eta: 60 },
      }),
    ).toBe(true);
    expect(
      isPluginMessage({
        event: "queue-again-answer",
        songId: "song-0",
        answer: { kind: "refused", reason: "recently-played" },
      }),
    ).toBe(true);
    expect(
      isPluginMessage({
        event: "queue-again-answer",
        answer: { kind: "accepted", position: 1, eta: 60 },
      }),
    ).toBe(false);
  });

  it("accepts the answer to the streamer's Request", () => {
    expect(
      isPluginMessage({
        event: "request-answer",
        answer: { kind: "accepted", position: 2, eta: 300 },
      }),
    ).toBe(true);
    expect(
      isPluginMessage({
        event: "request-answer",
        answer: { kind: "accepted", position: 0, eta: null },
      }),
    ).toBe(true);
    expect(
      isPluginMessage({
        event: "request-answer",
        answer: { kind: "refused", reason: "too-long" },
      }),
    ).toBe(true);
    expect(
      isPluginMessage({
        event: "request-answer",
        answer: { kind: "refused", reason: "rude" },
      }),
    ).toBe(false);
  });
});

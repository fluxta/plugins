import { Plugin, type SourceContext } from "@fluxta/sdk/api";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SongQueue } from "../songs/song-queue";
import { fakeProvider } from "../test-support/fake-provider";
import { HostSocket } from "../test-support/host-socket";
import { createPlaybackSources } from "./playback";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  HostSocket.instances = [];
});

describe("playback Query Sources", () => {
  it("answers through the SDK after a host reconnect without another Action or state change", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", HostSocket);
    vi.stubEnv("FLUXTA_PLUGIN_TOKEN", "test-grant");
    vi.stubEnv("FLUXTA_WS_URL", "ws://localhost:3000/ws/plugin");
    vi.stubEnv("FLUXTA_API_VERSION", "1");
    const { provider } = fakeProvider();
    const queue = new SongQueue({ providers: [provider], newId: () => "song" });
    await queue.request("fake:waiting@100");
    queue.playback("pause");
    queue.setVolume(30);
    const plugin = new Plugin();
    for (const source of createPlaybackSources(queue))
      plugin.registerSource(source);
    const connecting = plugin.connect();
    HostSocket.instances[0].open();
    await connecting;
    HostSocket.instances[0].close();
    await vi.advanceTimersByTimeAsync(1000);
    const after = HostSocket.instances[1];
    after.open();
    after.receive({
      type: "request",
      requestId: "pause",
      event: { event: "resolveSource", key: "isPaused", itemId: 0, args: {} },
    });
    after.receive({
      type: "request",
      requestId: "volume",
      event: { event: "resolveSource", key: "volume", itemId: 0, args: {} },
    });
    after.receive({
      type: "request",
      requestId: "length",
      event: {
        event: "resolveSource",
        key: "queueLength",
        itemId: 0,
        args: {},
      },
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(after.sent).toEqual([
      {
        type: "response",
        requestId: "pause",
        event: { event: "resolveSource", value: true },
      },
      {
        type: "response",
        requestId: "volume",
        event: { event: "resolveSource", value: 30 },
      },
      {
        type: "response",
        requestId: "length",
        event: { event: "resolveSource", value: 1 },
      },
    ]);
  });
  it("reads current queue, Player and control state on every query", async () => {
    const { provider, player } = fakeProvider();
    let id = 0;
    const queue = new SongQueue({
      providers: [provider],
      newId: () => `${++id}`,
    });
    const sources = createPlaybackSources(queue);
    const read = async () =>
      Object.fromEntries(
        await Promise.all(
          sources.map(async (source) => [
            source.key,
            await source.resolve({
              itemId: 0,
              args: {},
            } satisfies SourceContext),
          ]),
        ),
      );
    expect(await read()).toEqual({
      isPlaying: false,
      isPaused: false,
      playerConnected: false,
      currentTitle: "",
      currentRequester: "",
      isFallback: false,
      queueLength: 0,
      queueDuration: 0,
      volume: 100,
    });
    await queue.request("fake:first@100", {
      requesterPlatform: "twitch",
      requesterId: "1",
      requesterName: "Viewer",
      reference: "",
    });
    await queue.request("fake:unknown");
    await queue.request("fake:third@80");
    expect(await read()).toMatchObject({ queueLength: 3, queueDuration: 180 });
    player.connect();
    expect(await read()).toMatchObject({
      isPlaying: false,
      playerConnected: true,
    });
    player.load();
    expect(await read()).toMatchObject({
      isPlaying: true,
      currentTitle: "first",
      currentRequester: "Viewer",
      queueLength: 2,
      queueDuration: 80,
    });
    queue.playback("pause");
    queue.setVolume(25);
    expect(await read()).toMatchObject({
      isPlaying: false,
      isPaused: true,
      volume: 25,
    });
    player.disconnect();
    expect(await read()).toMatchObject({
      playerConnected: false,
      isPaused: true,
    });
    player.connect();
    expect(await read()).toMatchObject({
      playerConnected: true,
      isPaused: true,
      volume: 25,
    });
    queue.skip();
    expect(await read()).toMatchObject({
      currentTitle: "",
      currentRequester: "",
      queueLength: 2,
    });
  });

  it("reads the Fallback Track on air, and falls silent when the playlist is gone", async () => {
    const { provider, player } = fakeProvider();
    let id = 0;
    const queue = new SongQueue({
      providers: [provider],
      newId: () => `${++id}`,
    });
    const sources = createPlaybackSources(queue);
    const read = async () =>
      Object.fromEntries(
        await Promise.all(
          sources.map(async (source) => [
            source.key,
            await source.resolve({ itemId: 0, args: {} }),
          ]),
        ),
      );
    player.connect();
    queue.setFallbackTracks([
      {
        provider: "fake",
        trackId: "fallback-1",
        title: "Fallback One",
        channel: "Channel",
        channelUrl: "fake://channel",
        url: "fake://fallback-1",
        duration: 100,
      },
    ]);
    player.load();
    expect(await read()).toMatchObject({
      isPlaying: true,
      isFallback: true,
      currentTitle: "Fallback One",
      currentRequester: "",
    });
    queue.setFallbackTracks(undefined);
    expect(await read()).toMatchObject({
      isFallback: true,
      currentTitle: "Fallback One",
    });
    queue.skip();
    expect(await read()).toMatchObject({
      isPlaying: false,
      isFallback: false,
      currentTitle: "",
    });
  });
});

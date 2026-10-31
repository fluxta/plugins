import { Plugin, StandaloneTriggerContext } from "@fluxta/sdk/api";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RequestsAction } from "../actions/requests";
import { songQueue } from "../test-support/song-queue";
import { HostSocket } from "../test-support/host-socket";
import { createRequestsSource } from "./requests";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  HostSocket.instances = [];
});

describe("Requests Open Query Source", () => {
  it("reflects Requests Actions and answers after a host reconnect without another change", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", HostSocket);
    vi.stubEnv("FLUXTA_PLUGIN_TOKEN", "test-grant");
    vi.stubEnv("FLUXTA_WS_URL", "ws://localhost:3000/ws/plugin");
    vi.stubEnv("FLUXTA_API_VERSION", "1");
    const { queue } = songQueue();
    const source = createRequestsSource(queue);
    expect(await source.resolve({ itemId: 0, args: {} })).toBe(true);
    const plugin = new Plugin();
    plugin.registerSource(source);
    const connecting = plugin.connect();
    HostSocket.instances[0].open();
    await connecting;
    new RequestsAction(queue).onTrigger(
      new StandaloneTriggerContext("close", { mode: "close" }),
    );
    expect(await source.resolve({ itemId: 0, args: {} })).toBe(false);
    HostSocket.instances[0].close();
    await vi.advanceTimersByTimeAsync(1000);
    const after = HostSocket.instances[1];
    after.open();
    after.receive({
      type: "request",
      requestId: "requests-open",
      event: {
        event: "resolveSource",
        key: "requestsOpen",
        itemId: 0,
        args: {},
      },
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(after.sent).toEqual([
      {
        type: "response",
        requestId: "requests-open",
        event: { event: "resolveSource", value: false },
      },
    ]);
  });
});

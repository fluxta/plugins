import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { numericValue } from "wave-link-protocol";
import { runVolume } from "../actions/volume-action";
import { createLevelSources } from "../sources/levels";
import { harness } from "../testing/fake-wave-link";
import { MixerState } from "./state";

const channel = { targetKind: "channel" as const, channelId: "music" };
const contribution = {
  ...channel,
  targetKind: "channelMix" as const,
  mixId: "stream",
};
const mix = { targetKind: "mix" as const, mixId: "stream" };
const success = { success: true, error: "" };

describe("Wave Link lifecycle and commands", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("hydrates without value events and resolves all three independent levels", async () => {
    const { service, callbacks } = harness();
    await service.start();
    expect(service.snapshot().status).toBe("connected");
    expect(service.read(channel)).toMatchObject({
      volumePercent: 80,
      muted: false,
    });
    expect(service.read(contribution)).toMatchObject({
      volumePercent: 50,
      muted: false,
    });
    expect(service.read(mix)).toMatchObject({
      volumePercent: 100,
      muted: false,
    });
    expect(callbacks.volumeChanged).not.toHaveBeenCalled();
    expect(callbacks.muteChanged).not.toHaveBeenCalled();
    service.stop();
  });

  it("changes only the requested mute flag and emits its own confirmed change once", async () => {
    const { service, backend, callbacks } = harness();
    await service.start();
    expect(await service.setMute(contribution, "mute")).toEqual(success);
    expect(service.read(channel)?.muted).toBe(false);
    expect(service.read(mix)?.muted).toBe(false);
    expect(service.read(contribution)?.muted).toBe(true);
    expect(backend.data.channels[0].mixes[1].isMuted).toBe(false);
    expect(callbacks.muteChanged).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        targetKind: "channelMix",
        mixId: "stream",
        muted: true,
        previousMuted: false,
      }),
    );
    expect(await service.setMute(contribution, "mute")).toEqual(success);
    expect(callbacks.muteChanged).toHaveBeenCalledTimes(1);
    expect(
      backend.calls.filter((call) => call.method === "setChannel"),
    ).toHaveLength(1);
    service.stop();
  });

  it("serializes rapid relative-volume and toggle commands", async () => {
    const { service, callbacks } = harness();
    await service.start();
    expect(
      await Promise.all([
        service.setVolume(contribution, 5, true),
        service.setVolume(contribution, 5, true),
      ]),
    ).toEqual([success, success]);
    expect(service.read(contribution)?.volumePercent).toBeCloseTo(60);
    expect(callbacks.volumeChanged).toHaveBeenCalledTimes(2);
    expect(
      await Promise.all([
        service.setMute(channel, "toggle"),
        service.setMute(channel, "toggle"),
      ]),
    ).toEqual([success, success]);
    expect(service.read(channel)?.muted).toBe(false);
    expect(callbacks.muteChanged).toHaveBeenCalledTimes(2);
    service.stop();
  });

  describe.each([channel, contribution, mix])(
    "background refreshes for $targetKind",
    (target) => {
      it("preserves both relative adjustments when an older poll reply arrives between command reads", async () => {
        const { service, backend, callbacks } = harness();
        backend.data.mixes[0].level = 0.5;
        await service.start();
        const initial = service.read(target)!.volumePercent!;
        const method = target.targetKind === "mix" ? "getMixes" : "getChannels";
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        backend.beforeReply = async (request) => {
          if (request === method) {
            backend.beforeReply = undefined;
            await gate;
          }
        };
        await vi.advanceTimersByTimeAsync(5000);

        const first = service.setVolume(target, 5, true);
        await vi.advanceTimersByTimeAsync(0);
        // Deliver the old poll snapshot immediately after the next command's
        // fresh read, before its await continuation calculates the adjustment.
        backend.afterRead = (request) => {
          if (request === method) release();
        };
        const second = service.setVolume(target, 5, true);
        await vi.advanceTimersByTimeAsync(0);
        // A serialized command waits for the poll instead of starting a read.
        release();
        expect(await Promise.all([first, second])).toEqual([success, success]);
        await vi.advanceTimersByTimeAsync(0);

        expect(service.read(target)?.volumePercent).toBeCloseTo(initial + 10);
        expect(
          callbacks.volumeChanged.mock.calls.map(([change]) => [
            change.previousVolumePercent,
            change.volumePercent,
          ]),
        ).toEqual([
          [expect.closeTo(initial), expect.closeTo(initial + 5)],
          [expect.closeTo(initial + 5), expect.closeTo(initial + 10)],
        ]);
        service.stop();
      });

      it("does not roll back a confirmed toggle or emit a false mute event", async () => {
        const { service, backend, callbacks } = harness();
        await service.start();
        const method = target.targetKind === "mix" ? "getMixes" : "getChannels";
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        backend.beforeReply = async (request) => {
          if (request === method) {
            backend.beforeReply = undefined;
            await gate;
          }
        };
        await vi.advanceTimersByTimeAsync(5000);

        const command = service.setMute(target, "toggle");
        await vi.advanceTimersByTimeAsync(0);
        release();
        expect(await command).toEqual(success);
        await vi.advanceTimersByTimeAsync(0);

        expect(service.read(target)?.muted).toBe(true);
        expect(callbacks.muteChanged).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            targetKind: target.targetKind,
            previousMuted: false,
            muted: true,
          }),
        );
        service.stop();
      });
    },
  );

  it("clamps both absolute and relative volume and changes whole Mixes independently", async () => {
    const { service } = harness();
    await service.start();
    expect(await service.setVolume(channel, 200, false)).toEqual(success);
    expect(service.read(channel)?.volumePercent).toBe(100);
    expect(await service.setVolume(channel, -500, true)).toEqual(success);
    expect(service.read(channel)?.volumePercent).toBe(0);
    expect(await service.setVolume(mix, 30, false)).toEqual(success);
    expect(service.read(mix)?.volumePercent).toBe(30);
    expect(service.read(contribution)?.volumePercent).toBe(50);
    expect(await service.setMute(mix, "mute")).toEqual(success);
    expect(service.read(mix)?.muted).toBe(true);
    service.stop();
  });

  it("rejects absent and nonnumeric template values instead of manufacturing zero", async () => {
    const { service, backend } = harness();
    await service.start();
    for (const value of [
      undefined,
      null,
      "",
      " ",
      "{{unresolved}}",
      false,
      Infinity,
      NaN,
    ]) {
      expect(() => numericValue(value)).toThrow();
    }
    expect(numericValue(" -5.5 ")).toBe(-5.5);
    expect(
      (
        await runVolume(
          service,
          { ...channel, volumePercent: "{{missing}}" },
          false,
        )
      ).success,
    ).toBe(false);
    expect(backend.calls.some((call) => call.method.startsWith("set"))).toBe(
      false,
    );
    service.stop();
  });

  it("handles partial external notifications without deleting other Mixes or repeating events", async () => {
    const { service, backend, callbacks } = harness();
    await service.start();
    const patch = { id: "music", mixes: [{ id: "stream", isMuted: true }] };
    backend.notify("channelChanged", patch);
    backend.notify("channelChanged", patch);
    expect(service.read(contribution)).toMatchObject({
      muted: true,
      volumePercent: 50,
    });
    expect(service.snapshot().channels[0].mixes).toHaveLength(2);
    expect(callbacks.muteChanged).toHaveBeenCalledTimes(1);
    expect(callbacks.volumeChanged).not.toHaveBeenCalled();
    backend.notify("channelChanged", { id: "music", name: "Renamed Music" });
    expect(service.read(channel)).toMatchObject({
      channelName: "Renamed Music",
    });
    expect(callbacks.muteChanged).toHaveBeenCalledTimes(1);
    service.stop();
  });

  it("refuses a deleted target even if its replacement has the same name", async () => {
    const { service, backend } = harness();
    await service.start();
    backend.data.channels[0].id = "replacement";
    backend.notify("channelsChanged", { channels: backend.data.channels });
    expect(service.read(channel)).toBeNull();
    const result = await service.setMute(channel, "unmute");
    expect(result.success).toBe(false);
    expect(result.error).toContain("unavailable");
    expect(backend.calls.some((call) => call.method === "setChannel")).toBe(
      false,
    );
    service.stop();
  });

  it("makes offline values absent, rejects commands immediately and hydrates silently on reconnect", async () => {
    const { service, backend, callbacks } = harness();
    await service.start();
    backend.connections[0].close();
    expect(service.read(channel)).toBeNull();
    const source = createLevelSources(service).find(
      (source) => source.key === "channelMuted",
    )!;
    expect(
      source.resolve({ itemId: 0, args: { channelId: "music" } }),
    ).toBeNull();
    expect((await service.setMute(channel, "mute")).success).toBe(false);
    backend.data.channels[0].isMuted = true;
    await vi.advanceTimersByTimeAsync(500);
    expect(service.snapshot().status).toBe("connected");
    expect(service.read(channel)?.muted).toBe(true);
    expect(callbacks.muteChanged).not.toHaveBeenCalled();
    expect(backend.calls.some((call) => call.method.startsWith("set"))).toBe(
      false,
    );
    service.stop();
  });

  it("does not replay commands admitted before a disconnect", async () => {
    const { service, backend } = harness();
    await service.start();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    backend.beforeRequest = async (method) => {
      if (method === "getChannels") await gate;
    };
    const commands = [
      service.setVolume(channel, 5, true),
      service.setMute(channel, "toggle"),
    ];
    await Promise.resolve();
    backend.connections[0].close();
    backend.beforeRequest = undefined;
    await vi.advanceTimersByTimeAsync(500);
    release();
    expect(
      (await Promise.all(commands)).every((result) => !result.success),
    ).toBe(true);
    expect(backend.calls.some((call) => call.method.startsWith("set"))).toBe(
      false,
    );
    service.stop();
  });

  it("does not declare a successful write when Wave Link ignores it", async () => {
    const { service, backend, callbacks } = harness();
    await service.start();
    backend.ignoreWrites = true;
    expect((await service.setVolume(channel, 10, false)).success).toBe(false);
    expect(service.read(channel)?.volumePercent).toBe(80);
    expect(callbacks.volumeChanged).not.toHaveBeenCalled();
    service.stop();
  });

  it("invalidates stale values immediately when a state read is incompatible", async () => {
    const { service, backend } = harness();
    await service.start();
    backend.data.channels[0].level = 4;
    expect((await service.setMute(channel, "mute")).success).toBe(false);
    expect(service.read(channel)).toBeNull();
    expect(service.snapshot().status).toBe("connecting");
    expect(backend.calls.some((call) => call.method === "setChannel")).toBe(
      false,
    );
    service.stop();
  });

  it("detects missing capabilities without inventing channel-wide values", async () => {
    const { service, backend } = harness();
    delete (backend.data.channels[0] as { level?: number }).level;
    await service.start();
    expect(service.read(channel)?.volumePercent).toBeNull();
    expect((await service.setVolume(channel, 30, false)).success).toBe(false);
    expect(await service.setVolume(contribution, 30, false)).toEqual(success);
    service.stop();
  });

  it("rejects another application's port and cancels retries on stop", async () => {
    const { service, backend } = harness();
    backend.appInfo = { appID: "OTHER", interfaceRevision: 2 };
    await service.start();
    expect(service.snapshot().status).toBe("error");
    expect(service.read(channel)).toBeNull();
    service.stop();
    await vi.advanceTimersByTimeAsync(100000);
    expect(backend.connections).toHaveLength(1);
  });

  it("retries when the transport closes after the last initialization reply", async () => {
    const { service, backend } = harness();
    backend.afterRead = (method) => {
      if (method === "getMixes") backend.connections[0].close();
    };
    await service.start();
    expect(service.snapshot().status).toBe("error");
    backend.afterRead = undefined;
    await vi.advanceTimersByTimeAsync(500);
    expect(service.snapshot().status).toBe("connected");
    service.stop();
  });

  it("does not let failed initialization from an old session clear a newer session", async () => {
    const { service, backend } = harness();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    backend.beforeRequest = async (method) => {
      if (method === "getChannels") await gate;
    };
    const starting = service.start();
    await vi.advanceTimersByTimeAsync(0);
    service.stop();
    backend.beforeRequest = undefined;
    await service.start();
    backend.connections[0].close();
    release();
    await starting;
    expect(service.snapshot().status).toBe("connected");
    expect(service.read(channel)?.volumePercent).toBe(80);
    service.stop();
  });

  it("does not let an old poll failure disconnect a newer session", async () => {
    const { service, backend } = harness();
    await service.start();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    backend.beforeRequest = async (method) => {
      if (method === "getMixes") await gate;
    };
    await vi.advanceTimersByTimeAsync(5000);
    backend.connections[0].close();
    backend.beforeRequest = undefined;
    await vi.advanceTimersByTimeAsync(500);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(service.snapshot().status).toBe("connected");
    expect(service.read(mix)?.volumePercent).toBe(100);
    service.stop();
  });

  it("allows commands after a failed background read and reconnection", async () => {
    const { service, backend } = harness();
    await service.start();
    backend.beforeRequest = async (method) => {
      if (method === "getChannels") {
        backend.beforeRequest = undefined;
        throw new Error("State read failed.");
      }
    };
    await vi.advanceTimersByTimeAsync(5000);
    expect(service.read(channel)).toBeNull();
    await vi.advanceTimersByTimeAsync(500);
    expect(service.snapshot().status).toBe("connected");
    expect(await service.setVolume(channel, 5, true)).toEqual(success);
    expect(service.read(channel)?.volumePercent).toBeCloseTo(85);
    service.stop();
  });

  it("discards a queued notification refresh when its connection is replaced", async () => {
    const { service, backend } = harness();
    await service.start();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    backend.beforeRequest = async (method) => {
      if (method === "getChannels") await gate;
    };
    const command = service.setVolume(channel, 5, true);
    await vi.advanceTimersByTimeAsync(0);
    backend.notify("channelChanged", { id: "new-channel" });
    const oldRpc = backend.connections[0];
    oldRpc.close();
    backend.beforeRequest = undefined;
    await vi.advanceTimersByTimeAsync(500);
    const oldRequests = vi.spyOn(oldRpc, "request");
    release();
    expect((await command).success).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(oldRequests).not.toHaveBeenCalled();
    expect(service.snapshot().status).toBe("connected");
    expect(await service.setMute(channel, "toggle")).toEqual(success);
    expect(service.read(channel)?.muted).toBe(true);
    service.stop();
  });

  it("merges notifications arriving during hydration without creating Events", async () => {
    const { service, backend, callbacks } = harness();
    backend.afterRead = (method) => {
      if (method === "getChannels")
        backend.notify("channelChanged", { id: "music", level: 0.3 });
    };
    await service.start();
    expect(service.read(channel)?.volumePercent).toBe(30);
    expect(callbacks.volumeChanged).not.toHaveBeenCalled();
    service.stop();
  });

  it("polls confirmed state when notifications are missing", async () => {
    const { service, backend, callbacks } = harness();
    await service.start();
    backend.data.mixes[0].level = 0.25;
    await vi.advanceTimersByTimeAsync(5000);
    expect(service.read(mix)?.volumePercent).toBe(25);
    expect(callbacks.volumeChanged).toHaveBeenCalledTimes(1);
    service.stop();
  });
});

it.each(["id", "mixId"] as const)(
  "retains the server's %s spelling in per-Mix writes",
  (key) => {
    const state = new MixerState(vi.fn(), vi.fn());
    state.replaceChannels({
      channels: [
        {
          id: "music",
          name: "Music",
          mixes: [{ [key]: "stream", level: 0.5, isMuted: false }],
        },
      ],
    });
    state.replaceMixes({
      mixes: [{ id: "stream", name: "Stream", level: 1, isMuted: false }],
    });
    expect(state.update(contribution, { level: 0.4 })).toEqual({
      method: "setChannel",
      params: { id: "music", mixes: [{ [key]: "stream", level: 0.4 }] },
    });
  },
);

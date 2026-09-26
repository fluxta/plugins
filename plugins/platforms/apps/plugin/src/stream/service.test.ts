import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StreamsApi, StreamSource } from "./api";
import { StreamStatusService } from "./service";

const CHANNEL = "channel-1";

function stream(overrides: Partial<StreamSource> = {}): StreamSource {
  return { viewers: 42, ...overrides };
}

/** Twitch, as far as this service can tell. */
class FakeStreams implements StreamsApi {
  live: StreamSource | null = null;
  calls = 0;
  /** Thrown by the next read, to stand in for a transient failure. */
  refuse?: Error;

  getStreamByUserId(userId: string) {
    expect(userId).toBe(CHANNEL);
    this.calls += 1;

    if (this.refuse) {
      const error = this.refuse;
      this.refuse = undefined;
      return Promise.reject(error);
    }

    return Promise.resolve(this.live);
  }
}

describe("StreamStatusService", () => {
  let api: FakeStreams;
  let channelId: string | undefined;
  let service: StreamStatusService;
  let errors: string[];

  beforeEach(() => {
    api = new FakeStreams();
    channelId = CHANNEL;
    service = new StreamStatusService(() => channelId, api);

    errors = [];
    vi.spyOn(console, "error").mockImplementation((...args) => void errors.push(String(args[0])));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("before any Broadcaster Account is connected", () => {
    it("reports both values as absent, not as false or zero", () => {
      expect(service.isLive()).toBeUndefined();
      expect(service.viewerCount()).toBeUndefined();
    });

    it("stays idle when synced with no channel", async () => {
      channelId = undefined;
      await service.sync();

      expect(service.isLive()).toBeUndefined();
      expect(api.calls).toBe(0);
    });
  });

  describe("syncing with a connected broadcaster", () => {
    it("seeds live state from a channel that was already streaming", async () => {
      api.live = stream({ viewers: 100 });

      await service.sync();

      expect(service.isLive()).toBe(true);
      expect(service.viewerCount()).toBe(100);
    });

    it("seeds offline state, as a real false rather than absent", async () => {
      api.live = null;

      await service.sync();

      expect(service.isLive()).toBe(false);
      expect(service.viewerCount()).toBeUndefined();
    });

    it("does nothing on a sync that does not change the channel", async () => {
      await service.sync();
      const callsAfterFirst = api.calls;

      await service.sync();

      expect(api.calls).toBe(callsAfterFirst);
    });

    it("returns to idle, not offline, when the account disconnects", async () => {
      api.live = stream();
      await service.sync();

      channelId = undefined;
      await service.sync();

      expect(service.isLive()).toBeUndefined();
    });

    it("reports what twitch's error was, so the log explains a failed initial read", async () => {
      api.refuse = new Error("Twitch is down");

      await service.sync();

      expect(errors.join("\n")).toContain("Twitch is down");
    });
  });

  describe("going live", () => {
    beforeEach(async () => {
      api.live = null;
      await service.sync();
    });

    it("flips is-live immediately, trusting the push over a read", () => {
      const callsBefore = api.calls;

      service.wentLive();

      expect(service.isLive()).toBe(true);
      expect(api.calls).toBe(callsBefore);
    });

    it("starts the viewer count at zero until the next poll fills it in", () => {
      service.wentLive();

      expect(service.viewerCount()).toBe(0);
    });

    it("notifies is-live listeners with the new value", () => {
      const listener = vi.fn();
      service.onLiveChange(listener);

      service.wentLive();

      expect(listener).toHaveBeenCalledExactlyOnceWith(true);
    });

    it("notifies viewer-count listeners too, since the count really did just become zero", () => {
      const listener = vi.fn();
      service.onViewerCountChange(listener);

      service.wentLive();

      expect(listener).toHaveBeenCalledExactlyOnceWith(0);
    });
  });

  describe("going offline", () => {
    beforeEach(async () => {
      api.live = stream({ viewers: 250 });
      await service.sync();
    });

    it("flips is-live to false and drops the viewer count", () => {
      service.wentOffline();

      expect(service.isLive()).toBe(false);
      expect(service.viewerCount()).toBeUndefined();
    });

    it("notifies is-live listeners with false", () => {
      const listener = vi.fn();
      service.onLiveChange(listener);

      service.wentOffline();

      expect(listener).toHaveBeenCalledExactlyOnceWith(false);
    });

    it("does not notify viewer-count listeners, since there is nothing left to report", () => {
      const listener = vi.fn();
      service.onViewerCountChange(listener);

      service.wentOffline();

      expect(listener).not.toHaveBeenCalled();
    });

    it("does not notify is-live listeners again for a redundant offline push", () => {
      service.wentOffline();
      const listener = vi.fn();
      service.onLiveChange(listener);

      service.wentOffline();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("polling while live", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it("re-reads the viewer count on an interval, only while live", async () => {
      api.live = stream({ viewers: 10 });
      await service.sync();
      const callsAfterSync = api.calls;

      api.live = stream({ viewers: 20 });
      await vi.advanceTimersByTimeAsync(60_000);

      expect(api.calls).toBe(callsAfterSync + 1);
      expect(service.viewerCount()).toBe(20);
    });

    it("does not poll at all once the channel goes offline", async () => {
      api.live = stream({ viewers: 10 });
      await service.sync();

      service.wentOffline();
      const callsAfterOffline = api.calls;

      await vi.advanceTimersByTimeAsync(5 * 60_000);

      expect(api.calls).toBe(callsAfterOffline);
    });

    it("never polled at all while the channel stayed offline", async () => {
      api.live = null;
      await service.sync();
      const callsAfterSync = api.calls;

      await vi.advanceTimersByTimeAsync(10 * 60_000);

      expect(api.calls).toBe(callsAfterSync);
    });

    it("keeps the last known viewer count when a poll fails, rather than going absent", async () => {
      api.live = stream({ viewers: 7 });
      await service.sync();

      api.refuse = new Error("Twitch is down");
      await vi.advanceTimersByTimeAsync(60_000);

      expect(service.isLive()).toBe(true);
      expect(service.viewerCount()).toBe(7);
      expect(errors.join("\n")).toContain("Twitch is down");
    });

    it("keeps polling on the next tick after one poll fails", async () => {
      api.live = stream({ viewers: 7 });
      await service.sync();

      api.refuse = new Error("Twitch is down");
      await vi.advanceTimersByTimeAsync(60_000);

      api.live = stream({ viewers: 30 });
      await vi.advanceTimersByTimeAsync(60_000);

      expect(service.viewerCount()).toBe(30);
    });

    it("notifies viewer-count listeners when a poll reads a new number", async () => {
      api.live = stream({ viewers: 10 });
      await service.sync();

      const listener = vi.fn();
      service.onViewerCountChange(listener);
      api.live = stream({ viewers: 15 });
      await vi.advanceTimersByTimeAsync(60_000);

      expect(listener).toHaveBeenCalledExactlyOnceWith(15);
    });

    it("does not notify viewer-count listeners when a poll confirms the same number", async () => {
      api.live = stream({ viewers: 10 });
      await service.sync();

      const listener = vi.fn();
      service.onViewerCountChange(listener);
      await vi.advanceTimersByTimeAsync(60_000);

      expect(listener).not.toHaveBeenCalled();
    });

    it("does not notify is-live listeners for a poll that only confirms the channel is still live", async () => {
      api.live = stream({ viewers: 10 });
      await service.sync();

      const listener = vi.fn();
      service.onLiveChange(listener);
      api.live = stream({ viewers: 15 });
      await vi.advanceTimersByTimeAsync(60_000);

      expect(listener).not.toHaveBeenCalled();
    });

    it("notifies is-live listeners when a poll discovers a missed offline transition", async () => {
      api.live = stream({ viewers: 10 });
      await service.sync();

      const listener = vi.fn();
      service.onLiveChange(listener);
      api.live = null;
      await vi.advanceTimersByTimeAsync(60_000);

      expect(listener).toHaveBeenCalledExactlyOnceWith(false);
    });
  });

  describe("onLiveChange", () => {
    it("stops notifying once unsubscribed", () => {
      const listener = vi.fn();
      const unsubscribe = service.onLiveChange(listener);

      unsubscribe();
      service.wentLive();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("onViewerCountChange", () => {
    it("stops notifying once unsubscribed", () => {
      const listener = vi.fn();
      const unsubscribe = service.onViewerCountChange(listener);

      unsubscribe();
      service.wentLive();

      expect(listener).not.toHaveBeenCalled();
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChannelApi, ChannelInfoUpdate, ChannelTarget, GameTarget } from "./api";
import { ChannelService } from "./service";

const CHANNEL = "channel-1";

/** Twitch, as far as this service can tell. */
class FakeChannel implements ChannelApi {
  games = new Map<string, GameTarget>();
  users = new Map<string, ChannelTarget>();
  updated: { broadcaster: string; data: ChannelInfoUpdate }[] = [];
  raidsStarted: { from: string; to: string }[] = [];
  raidsCancelled: string[] = [];
  commercials: { broadcaster: string; length: number }[] = [];
  /** Thrown by the next write, to stand in for a refusal. */
  refuse?: Error;

  getGameByName(name: string) {
    return Promise.resolve(this.games.get(name) ?? null);
  }

  getUserByName(login: string) {
    return Promise.resolve(this.users.get(login) ?? null);
  }

  updateChannelInfo(broadcaster: string, data: ChannelInfoUpdate) {
    this.refused();
    this.updated.push({ broadcaster, data });
    return Promise.resolve(undefined);
  }

  startRaid(from: string, to: string) {
    this.refused();
    this.raidsStarted.push({ from, to });
    return Promise.resolve(undefined);
  }

  cancelRaid(from: string) {
    this.refused();
    this.raidsCancelled.push(from);
    return Promise.resolve(undefined);
  }

  startChannelCommercial(broadcaster: string, length: number) {
    this.refused();
    this.commercials.push({ broadcaster, length });
    return Promise.resolve(undefined);
  }

  private refused(): void {
    if (this.refuse) {
      throw this.refuse;
    }
  }
}

describe("ChannelService", () => {
  let api: FakeChannel;
  let channelId: string | undefined;
  let service: ChannelService;
  let errors: string[];
  let logs: string[];

  beforeEach(() => {
    api = new FakeChannel();
    api.games.set("Just Chatting", { id: "509658" });
    api.users.set("friend", { id: "42", displayName: "Friend" });
    channelId = CHANNEL;
    service = new ChannelService(() => channelId, api);

    // The log is where an Action reports itself, so it is part of what these
    // tests are checking rather than noise to be hidden.
    errors = [];
    logs = [];
    vi.spyOn(console, "error").mockImplementation((...args) => void errors.push(String(args[0])));
    vi.spyOn(console, "warn").mockImplementation((...args) => void errors.push(String(args[0])));
    vi.spyOn(console, "log").mockImplementation((...args) => void logs.push(String(args[0])));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("updating stream info", () => {
    it("sends only the fields asked for", async () => {
      await service.updateInfo({ title: "New title" });

      expect(api.updated).toEqual([{ broadcaster: CHANNEL, data: { title: "New title" } }]);
    });

    it("resolves the category name to its Twitch id", async () => {
      await service.updateInfo({ category: "Just Chatting" });

      expect(api.updated).toEqual([{ broadcaster: CHANNEL, data: { gameId: "509658" } }]);
    });

    it("carries title, category and tags together", async () => {
      await service.updateInfo({
        title: "New title",
        category: "Just Chatting",
        tags: ["English", "Chill"],
      });

      expect(api.updated).toEqual([
        {
          broadcaster: CHANNEL,
          data: { title: "New title", gameId: "509658", tags: ["English", "Chill"] },
        },
      ]);
    });

    it("refuses a category twitch does not know, in the plugin's own words", async () => {
      await service.updateInfo({ category: "Not A Real Game" });

      expect(api.updated).toEqual([]);
      expect(errors.join("\n")).toContain("Not A Real Game");
    });

    it("does nothing, loudly, when nothing was asked to change", async () => {
      await service.updateInfo({});

      expect(api.updated).toEqual([]);
      expect(errors.join("\n")).toContain("nothing to change");
    });

    it("refuses with no broadcaster account", async () => {
      channelId = undefined;

      await service.updateInfo({ title: "New title" });

      expect(api.updated).toEqual([]);
      expect(errors.join("\n")).toContain("broadcaster account");
    });
  });

  describe("starting a raid", () => {
    it("resolves the login to a Twitch id before raiding", async () => {
      await service.startRaid("friend");

      expect(api.raidsStarted).toEqual([{ from: CHANNEL, to: "42" }]);
      expect(logs.join("\n")).toContain("Friend");
    });

    it("refuses a login twitch does not know", async () => {
      await service.startRaid("nobody");

      expect(api.raidsStarted).toEqual([]);
      expect(errors.join("\n")).toContain("nobody");
    });
  });

  describe("cancelling a raid", () => {
    it("asks twitch to cancel it", async () => {
      await service.cancelRaid();

      expect(api.raidsCancelled).toEqual([CHANNEL]);
    });

    it("reports what twitch refused, since there is no way to check first", async () => {
      api.refuse = Object.assign(new Error("nope"), {
        statusCode: 400,
        body: '{"message":"no raid in progress"}',
      });

      await service.cancelRaid();

      expect(errors.join("\n")).toContain("no raid in progress");
    });
  });

  describe("running a commercial", () => {
    it("runs it for the requested length", async () => {
      await service.runCommercial(90);

      expect(api.commercials).toEqual([{ broadcaster: CHANNEL, length: 90 }]);
    });
  });
});

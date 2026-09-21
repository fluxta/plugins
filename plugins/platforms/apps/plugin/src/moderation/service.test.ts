import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnnouncementColor } from "platforms-protocol";

import type {
  BanUserData,
  ChatSettingsSource,
  ChatSettingsUpdate,
  ModerationApi,
  ModerationTarget,
} from "./api";
import { ModerationService } from "./service";

const CHANNEL = "channel-1";

const NO_CHAT_SETTINGS: ChatSettingsSource = {
  slowModeEnabled: false,
  slowModeDelay: null,
  followerOnlyModeEnabled: false,
  followerOnlyModeDelay: null,
  subscriberOnlyModeEnabled: false,
  emoteOnlyModeEnabled: false,
  uniqueChatModeEnabled: false,
  nonModeratorChatDelayEnabled: false,
  nonModeratorChatDelay: null,
};

/** Twitch, as far as this service can tell. */
class FakeModeration implements ModerationApi {
  users = new Map<string, ModerationTarget>();
  banned: { broadcaster: string; data: BanUserData }[] = [];
  unbanned: { broadcaster: string; user: string }[] = [];
  shoutouts: { from: string; to: string }[] = [];
  moderatorsAdded: { broadcaster: string; user: string }[] = [];
  moderatorsRemoved: { broadcaster: string; user: string }[] = [];
  vipsAdded: { broadcaster: string; user: string }[] = [];
  vipsRemoved: { broadcaster: string; user: string }[] = [];
  deletions: { broadcaster: string; messageId: string | undefined }[] = [];
  warnings: { broadcaster: string; user: string; reason: string }[] = [];
  announcements: { broadcaster: string; message: string; color: AnnouncementColor | undefined }[] =
    [];
  chatSettings: ChatSettingsSource = { ...NO_CHAT_SETTINGS };
  chatSettingsReads = 0;
  chatSettingsUpdates: { broadcaster: string; data: ChatSettingsUpdate }[] = [];
  /** Thrown by the next write, to stand in for a refusal. */
  refuse?: Error;

  getUserByName(login: string) {
    return Promise.resolve(this.users.get(login) ?? null);
  }

  banUser(broadcaster: string, data: BanUserData) {
    this.refused();
    this.banned.push({ broadcaster, data });
    return Promise.resolve(undefined);
  }

  unbanUser(broadcaster: string, user: string) {
    this.refused();
    this.unbanned.push({ broadcaster, user });
    return Promise.resolve(undefined);
  }

  shoutoutUser(from: string, to: string) {
    this.refused();
    this.shoutouts.push({ from, to });
    return Promise.resolve(undefined);
  }

  addModerator(broadcaster: string, user: string) {
    this.refused();
    this.moderatorsAdded.push({ broadcaster, user });
    return Promise.resolve(undefined);
  }

  removeModerator(broadcaster: string, user: string) {
    this.refused();
    this.moderatorsRemoved.push({ broadcaster, user });
    return Promise.resolve(undefined);
  }

  addVip(broadcaster: string, user: string) {
    this.refused();
    this.vipsAdded.push({ broadcaster, user });
    return Promise.resolve(undefined);
  }

  removeVip(broadcaster: string, user: string) {
    this.refused();
    this.vipsRemoved.push({ broadcaster, user });
    return Promise.resolve(undefined);
  }

  deleteChatMessages(broadcaster: string, messageId?: string) {
    this.refused();
    this.deletions.push({ broadcaster, messageId });
    return Promise.resolve(undefined);
  }

  warnUser(broadcaster: string, user: string, reason: string) {
    this.refused();
    this.warnings.push({ broadcaster, user, reason });
    return Promise.resolve(undefined);
  }

  sendAnnouncement(broadcaster: string, message: string, color?: AnnouncementColor) {
    this.refused();
    this.announcements.push({ broadcaster, message, color });
    return Promise.resolve(undefined);
  }

  getChatSettings(_broadcaster: string) {
    this.chatSettingsReads += 1;
    return Promise.resolve(this.chatSettings);
  }

  updateChatSettings(broadcaster: string, data: ChatSettingsUpdate) {
    this.refused();
    this.chatSettingsUpdates.push({ broadcaster, data });
    return Promise.resolve(undefined);
  }

  private refused(): void {
    if (this.refuse) {
      throw this.refuse;
    }
  }
}

describe("ModerationService", () => {
  let api: FakeModeration;
  let channelId: string | undefined;
  let service: ModerationService;
  let errors: string[];
  let logs: string[];

  beforeEach(() => {
    api = new FakeModeration();
    api.users.set("troll", { id: "42", displayName: "Troll" });
    channelId = CHANNEL;
    service = new ModerationService(() => channelId, api);

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

  describe("banning", () => {
    it("resolves the login to a Twitch id before banning", async () => {
      await service.ban("troll", "spamming");

      expect(api.banned).toEqual([
        { broadcaster: CHANNEL, data: { user: "42", reason: "spamming" } },
      ]);
      expect(logs.join("\n")).toContain("Troll");
    });

    it("refuses a login twitch does not know, in the plugin's own words", async () => {
      await service.ban("nobody");

      expect(api.banned).toEqual([]);
      expect(errors.join("\n")).toContain("nobody");
    });

    it("refuses with no broadcaster account, and says which to connect", async () => {
      channelId = undefined;

      await service.ban("troll");

      expect(api.banned).toEqual([]);
      expect(errors.join("\n")).toContain("broadcaster account");
    });

    it("reports what twitch refused, in words the log can show", async () => {
      api.refuse = Object.assign(new Error("nope"), {
        statusCode: 400,
        body: '{"message":"reason is too long"}',
      });

      await service.ban("troll");

      expect(errors.join("\n")).toContain("reason is too long");
    });
  });

  describe("timing out", () => {
    it("carries the duration alongside the resolved id", async () => {
      await service.timeout("troll", 600, "cooling off");

      expect(api.banned).toEqual([
        { broadcaster: CHANNEL, data: { user: "42", duration: 600, reason: "cooling off" } },
      ]);
    });
  });

  describe("unbanning", () => {
    it("resolves the login and lifts the ban or timeout", async () => {
      await service.unban("troll");

      expect(api.unbanned).toEqual([{ broadcaster: CHANNEL, user: "42" }]);
      expect(logs.join("\n")).toContain("Troll");
    });
  });

  describe("shouting out", () => {
    it("resolves the login and sends the shoutout from the channel", async () => {
      await service.shoutout("troll");

      expect(api.shoutouts).toEqual([{ from: CHANNEL, to: "42" }]);
      expect(logs.join("\n")).toContain("Troll");
    });
  });

  describe("adding a moderator", () => {
    it("resolves the login and grants moderator status", async () => {
      await service.addModerator("troll");

      expect(api.moderatorsAdded).toEqual([{ broadcaster: CHANNEL, user: "42" }]);
      expect(logs.join("\n")).toContain("Troll");
    });
  });

  describe("removing a moderator", () => {
    it("resolves the login and revokes moderator status", async () => {
      await service.removeModerator("troll");

      expect(api.moderatorsRemoved).toEqual([{ broadcaster: CHANNEL, user: "42" }]);
      expect(logs.join("\n")).toContain("Troll");
    });
  });

  describe("adding a VIP", () => {
    it("resolves the login and grants VIP status", async () => {
      await service.addVip("troll");

      expect(api.vipsAdded).toEqual([{ broadcaster: CHANNEL, user: "42" }]);
      expect(logs.join("\n")).toContain("Troll");
    });
  });

  describe("removing a VIP", () => {
    it("resolves the login and revokes VIP status", async () => {
      await service.removeVip("troll");

      expect(api.vipsRemoved).toEqual([{ broadcaster: CHANNEL, user: "42" }]);
      expect(logs.join("\n")).toContain("Troll");
    });
  });

  describe("clearing chat", () => {
    it("deletes every message, without naming one", async () => {
      await service.clearChat();

      expect(api.deletions).toEqual([{ broadcaster: CHANNEL, messageId: undefined }]);
    });

    it("refuses with no broadcaster account", async () => {
      channelId = undefined;

      await service.clearChat();

      expect(api.deletions).toEqual([]);
      expect(errors.join("\n")).toContain("broadcaster account");
    });
  });

  describe("deleting a message", () => {
    it("deletes only the named message", async () => {
      await service.deleteMessage("message-1");

      expect(api.deletions).toEqual([{ broadcaster: CHANNEL, messageId: "message-1" }]);
    });
  });

  describe("warning a viewer", () => {
    it("resolves the login and carries the reason", async () => {
      await service.warnUser("troll", "watch the language");

      expect(api.warnings).toEqual([
        { broadcaster: CHANNEL, user: "42", reason: "watch the language" },
      ]);
      expect(logs.join("\n")).toContain("Troll");
    });
  });

  describe("sending an announcement", () => {
    it("carries the message and the colour", async () => {
      await service.sendAnnouncement("Back in 5!", "purple");

      expect(api.announcements).toEqual([
        { broadcaster: CHANNEL, message: "Back in 5!", color: "purple" },
      ]);
    });

    it("refuses with no broadcaster account", async () => {
      channelId = undefined;

      await service.sendAnnouncement("Back in 5!");

      expect(api.announcements).toEqual([]);
      expect(errors.join("\n")).toContain("broadcaster account");
    });
  });

  describe("updating chat settings", () => {
    it("sends only the modes asked for", async () => {
      await service.updateChatSettings({ slowMode: "enable" });

      expect(api.chatSettingsUpdates).toEqual([
        { broadcaster: CHANNEL, data: { slowModeEnabled: true } },
      ]);
      expect(api.chatSettingsReads).toBe(0);
    });

    it("does not read current settings unless a toggle is asked for", async () => {
      await service.updateChatSettings({ subscriberOnlyMode: "disable", emoteOnlyMode: "enable" });

      expect(api.chatSettingsReads).toBe(0);
    });

    it("reads current settings to resolve a toggle", async () => {
      api.chatSettings = { ...NO_CHAT_SETTINGS, slowModeEnabled: true };

      await service.updateChatSettings({ slowMode: "toggle" });

      expect(api.chatSettingsReads).toBe(1);
      expect(api.chatSettingsUpdates).toEqual([
        { broadcaster: CHANNEL, data: { slowModeEnabled: false } },
      ]);
    });

    it("treats a given delay as also asking to turn the mode on", async () => {
      await service.updateChatSettings({ slowModeDelaySeconds: 10 });

      expect(api.chatSettingsUpdates).toEqual([
        { broadcaster: CHANNEL, data: { slowModeEnabled: true, slowModeDelay: 10 } },
      ]);
    });

    it("carries the follower-only and non-moderator delays the same way", async () => {
      await service.updateChatSettings({
        followerOnlyModeDelayMinutes: 30,
        nonModeratorChatDelaySeconds: 4,
      });

      expect(api.chatSettingsUpdates).toEqual([
        {
          broadcaster: CHANNEL,
          data: {
            followerOnlyModeEnabled: true,
            followerOnlyModeDelay: 30,
            nonModeratorChatDelayEnabled: true,
            nonModeratorChatDelay: 4,
          },
        },
      ]);
    });

    it("does nothing, loudly, when nothing was asked to change", async () => {
      await service.updateChatSettings({});

      expect(api.chatSettingsUpdates).toEqual([]);
      expect(errors.join("\n")).toContain("nothing to change");
    });

    it("refuses with no broadcaster account", async () => {
      channelId = undefined;

      await service.updateChatSettings({ slowMode: "enable" });

      expect(api.chatSettingsUpdates).toEqual([]);
      expect(errors.join("\n")).toContain("broadcaster account");
    });
  });
});

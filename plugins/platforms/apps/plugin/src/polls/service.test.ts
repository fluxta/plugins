import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PollsApi } from "./api";
import type { PollDraft, PollSource } from "./poll";
import { PollsService } from "./service";

const CHANNEL = "channel-1";

function poll(overrides: Partial<PollSource> = {}): PollSource {
  return {
    id: "poll-1",
    title: "Who wins?",
    status: "ACTIVE",
    choices: [{ title: "Team A" }, { title: "Team B" }],
    ...overrides,
  };
}

function draft(overrides: Partial<PollDraft> = {}): PollDraft {
  return { title: "Who wins?", choices: ["Team A", "Team B"], duration: 60, ...overrides };
}

/** Twitch, as far as this service can tell. */
class FakePolls implements PollsApi {
  polls: PollSource[] = [];
  created: { title: string; choices: string[]; duration: number }[] = [];
  ended: string[] = [];
  /** Thrown by the next write, to stand in for a refusal. */
  refuse?: Error;

  getPolls(broadcaster: string) {
    expect(broadcaster).toBe(CHANNEL);
    return Promise.resolve({ data: this.polls });
  }

  createPoll(
    _broadcaster: string,
    data: { title: string; choices: string[]; duration: number },
  ) {
    this.refused();
    this.created.push(data);

    const created = poll({
      id: `poll-${this.polls.length + 1}`,
      title: data.title,
      choices: data.choices.map((title) => ({ title })),
    });

    this.polls.push(created);
    return Promise.resolve(created);
  }

  endPoll(_broadcaster: string, id: string) {
    this.refused();
    this.ended.push(id);

    const ended = this.polls.find((existing) => existing.id === id);
    this.polls = this.polls.map((existing) =>
      existing.id === id ? { ...existing, status: "TERMINATED" } : existing,
    );

    return Promise.resolve(ended ?? poll({ id }));
  }

  private refused(): void {
    if (this.refuse) {
      throw this.refuse;
    }
  }
}

describe("PollsService", () => {
  let api: FakePolls;
  let channelId: string | undefined;
  let service: PollsService;
  let errors: string[];
  let logs: string[];

  beforeEach(() => {
    api = new FakePolls();
    channelId = CHANNEL;
    service = new PollsService(() => channelId, api);

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

  describe("starting a poll", () => {
    it("creates it on twitch and returns its id", async () => {
      const id = await service.start(draft());

      expect(id).toBe("poll-1");
      expect(api.created).toEqual([
        { title: "Who wins?", choices: ["Team A", "Team B"], duration: 60 },
      ]);
    });

    it("refuses a second poll while one is running, in the plugin's own words", async () => {
      api.polls = [poll({ id: "poll-1", title: "First poll" })];

      const id = await service.start(draft({ title: "Second poll" }));

      expect(id).toBeUndefined();
      expect(api.created).toEqual([]);
      expect(errors.join("\n")).toContain("First poll");
      expect(errors.join("\n")).toContain("still running");
    });

    it("does not confuse a poll that already ended with one still running", async () => {
      api.polls = [poll({ id: "poll-1", status: "COMPLETED" })];

      const id = await service.start(draft({ title: "New poll" }));

      expect(id).toBe("poll-2");
    });

    it("refuses with no broadcaster account, and says which to connect", async () => {
      channelId = undefined;

      const id = await service.start(draft());

      expect(id).toBeUndefined();
      expect(errors.join("\n")).toContain("broadcaster account");
    });

    it("reports what twitch refused, in words the log can show", async () => {
      api.refuse = Object.assign(new Error("nope"), {
        statusCode: 400,
        body: '{"message":"duration must be between 15 and 1800"}',
      });

      const id = await service.start(draft());

      expect(id).toBeUndefined();
      expect(errors.join("\n")).toContain("duration must be between 15 and 1800");
    });
  });

  describe("ending a poll", () => {
    it("ends whichever poll is running", async () => {
      api.polls = [poll({ id: "poll-1", title: "Who wins?" })];

      await service.end();

      expect(api.ended).toEqual(["poll-1"]);
      expect(logs.join("\n")).toContain("Who wins?");
    });

    it("does nothing, loudly, when no poll is running", async () => {
      await service.end();

      expect(api.ended).toEqual([]);
      expect(errors.join("\n")).toContain("no poll currently running");
    });

    it("does not throw with no poll running, so the run does not fail", async () => {
      await expect(service.end()).resolves.toBeUndefined();
    });

    it("refuses with no broadcaster account", async () => {
      channelId = undefined;

      await service.end();

      expect(api.ended).toEqual([]);
      expect(errors.join("\n")).toContain("broadcaster account");
    });
  });
});

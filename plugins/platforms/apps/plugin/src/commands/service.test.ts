import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatMessagePayload } from "../events/chat-message";
import type { CommandTriggeredPayload } from "../events/command-triggered";

import type { Command } from "./command";
import { CommandService } from "./service";

function command(overrides: Partial<Command> = {}): Command {
  return {
    id: "c1",
    name: "!roll",
    aliases: [],
    enabled: true,
    permission: "everyone",
    globalCooldown: 0,
    userCooldown: 0,
    ...overrides,
  };
}

function chatMessage(overrides: Partial<ChatMessagePayload> = {}): ChatMessagePayload {
  return {
    message: "!roll",
    userId: "42",
    userLogin: "viewer",
    userName: "Viewer",
    messageId: "msg-1",
    isBroadcaster: false,
    isModerator: false,
    isVip: false,
    isSubscriber: false,
    ...overrides,
  };
}

describe("CommandService", () => {
  let emitted: { type: string; payload: CommandTriggeredPayload }[];
  let commands: Command[];
  let service: CommandService;

  beforeEach(() => {
    emitted = [];
    commands = [command()];
    service = new CommandService(
      () => commands,
      (type, payload) => emitted.push({ type, payload }),
    );
  });

  it("emits Command Triggered with the chat context and the command", () => {
    service.handle(chatMessage({ message: "!roll 2d6" }));

    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.type).toBe("command-triggered");
    expect(emitted[0]?.payload).toMatchObject({
      command: "!roll",
      alias: "!roll",
      args: "2d6",
      message: "!roll 2d6",
      userLogin: "viewer",
      messageId: "msg-1",
    });
  });

  it("stays quiet for an ordinary message", () => {
    service.handle(chatMessage({ message: "just chatting" }));

    expect(emitted).toEqual([]);
  });

  it("reports the canonical name when an alias was typed", () => {
    commands = [command({ aliases: ["!r"] })];

    service.handle(chatMessage({ message: "!r" }));

    expect(emitted[0]?.payload).toMatchObject({ command: "!roll", alias: "!r" });
  });

  it("stays quiet when the viewer lacks the standing", () => {
    commands = [command({ permission: "moderator" })];

    service.handle(chatMessage());

    expect(emitted).toEqual([]);
  });

  it("holds a second use during the cooldown, then allows it", () => {
    vi.useFakeTimers();

    try {
      commands = [command({ globalCooldown: 30 })];

      service.handle(chatMessage());
      service.handle(chatMessage());
      expect(emitted).toHaveLength(1);

      vi.advanceTimersByTime(30_000);
      service.handle(chatMessage());
      expect(emitted).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not extend a cooldown from an attempt that was refused", () => {
    vi.useFakeTimers();

    try {
      commands = [command({ globalCooldown: 30, permission: "moderator" })];

      // A viewer who may not use it hammers the command...
      service.handle(chatMessage());
      vi.advanceTimersByTime(1000);
      service.handle(chatMessage());

      // ...which must not stop a moderator from using it right away.
      service.handle(chatMessage({ isModerator: true, userId: "99" }));
      expect(emitted).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sees a command added after it started", () => {
    commands = [];
    service.handle(chatMessage());
    expect(emitted).toEqual([]);

    commands = [command()];
    service.handle(chatMessage());
    expect(emitted).toHaveLength(1);
  });
});

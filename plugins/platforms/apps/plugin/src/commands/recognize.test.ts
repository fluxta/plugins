import { describe, expect, it } from "vitest";

import type { Command, PermissionLevel, Standing } from "./command";
import { recognize } from "./recognize";

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

const viewer: Standing = {
  isBroadcaster: false,
  isModerator: false,
  isVip: false,
  isSubscriber: false,
};

const standingWith = (level: Exclude<PermissionLevel, "everyone">): Standing => ({
  ...viewer,
  isBroadcaster: level === "broadcaster",
  isModerator: level === "moderator",
  isVip: level === "vip",
  isSubscriber: level === "subscriber",
});

describe("recognize", () => {
  it("fires on the command word", () => {
    const result = recognize("!roll", viewer, [command()]);

    expect(result).toMatchObject({ fired: true, alias: "!roll", args: "" });
  });

  it("ignores an ordinary message", () => {
    expect(recognize("hello everyone", viewer, [command()])).toEqual({
      fired: false,
      reason: "no-match",
    });
  });

  it("ignores the command word in the middle of a sentence", () => {
    expect(recognize("i typed !roll earlier", viewer, [command()])).toMatchObject({
      fired: false,
    });
  });

  it("does not care about case", () => {
    expect(recognize("!ROLL", viewer, [command()])).toMatchObject({ fired: true });
  });

  it("reports which alias was typed, and the canonical command", () => {
    const result = recognize("!r 20", viewer, [command({ aliases: ["!r", "!dice"] })]);

    expect(result).toMatchObject({ fired: true, alias: "!r" });
    expect(result.fired && result.command.name).toBe("!roll");
  });

  it("hands over everything after the command as one string", () => {
    const result = recognize("!roll  2d6  for   luck ", viewer, [command()]);

    expect(result).toMatchObject({ args: "2d6  for   luck" });
  });

  it("does not fire a disabled command", () => {
    expect(recognize("!roll", viewer, [command({ enabled: false })])).toMatchObject({
      fired: false,
      reason: "disabled",
    });
  });

  it("keeps a command away from a viewer without the standing", () => {
    expect(recognize("!roll", viewer, [command({ permission: "moderator" })])).toMatchObject({
      fired: false,
      reason: "not-allowed",
    });
  });

  it.each(["subscriber", "vip", "moderator", "broadcaster"] as const)(
    "lets a %s use a command open to everyone",
    (level) => {
      expect(recognize("!roll", standingWith(level), [command()])).toMatchObject({ fired: true });
    },
  );

  it("lets a higher standing satisfy a lower requirement", () => {
    // A moderator who never subscribed can still use a subscriber command.
    const result = recognize("!roll", standingWith("moderator"), [
      command({ permission: "subscriber" }),
    ]);

    expect(result).toMatchObject({ fired: true });
  });

  it("does not let a lower standing satisfy a higher requirement", () => {
    expect(
      recognize("!roll", standingWith("vip"), [command({ permission: "moderator" })]),
    ).toMatchObject({ fired: false, reason: "not-allowed" });
  });

  it("picks the command whose word matches, not the first one", () => {
    const result = recognize("!hug", viewer, [
      command({ id: "a", name: "!roll" }),
      command({ id: "b", name: "!hug" }),
    ]);

    expect(result.fired && result.command.id).toBe("b");
  });

  it("ignores an empty message", () => {
    expect(recognize("   ", viewer, [command()])).toEqual({ fired: false, reason: "no-match" });
  });
});

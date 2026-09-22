import { describe, expect, it } from "vitest";

import { validateCommand, type Command } from "./command";

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

describe("validateCommand", () => {
  it("accepts a command with a name and no clashes", () => {
    expect(validateCommand(command(), [])).toBeUndefined();
  });

  it("refuses a command with no name", () => {
    expect(validateCommand(command({ name: "  " }), [])).toMatch(/name/i);
  });

  it("refuses a name with a space, which could never match", () => {
    // Only the first word of a message is compared, so a two-word name is
    // unreachable rather than merely unusual.
    expect(validateCommand(command({ name: "!roll dice" }), [])).toMatch(/spaces/i);
  });

  it("refuses an alias that repeats the name", () => {
    expect(validateCommand(command({ aliases: ["!ROLL"] }), [])).toMatch(/twice/i);
  });

  it("refuses a word another command already answers to", () => {
    const existing = command({ id: "other", name: "!dice", aliases: ["!r"] });

    expect(validateCommand(command({ aliases: ["!r"] }), [existing])).toMatch(/!dice/);
  });

  it("ignores case when looking for a clash", () => {
    const existing = command({ id: "other", name: "!ROLL" });

    expect(validateCommand(command(), [existing])).toMatch(/already used/i);
  });

  it("lets a command keep its own words while being edited", () => {
    const saved = command({ aliases: ["!r"] });

    expect(validateCommand({ ...saved, permission: "moderator" }, [saved])).toBeUndefined();
  });
});

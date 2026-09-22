import { describe, expect, it } from "vitest";

import type { Command } from "./command";
import { Cooldowns } from "./cooldowns";

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

describe("Cooldowns", () => {
  it("lets a command with no cooldown fire as often as asked", () => {
    const cooldowns = new Cooldowns();
    const roll = command();

    cooldowns.record(roll, "viewer", 0);

    expect(cooldowns.isCoolingDown(roll, "viewer", 0)).toBe(false);
  });

  it("holds everyone back during a global cooldown", () => {
    const cooldowns = new Cooldowns();
    const roll = command({ globalCooldown: 30 });

    cooldowns.record(roll, "alice", 0);

    expect(cooldowns.isCoolingDown(roll, "alice", 10_000)).toBe(true);
    expect(cooldowns.isCoolingDown(roll, "bob", 10_000)).toBe(true);
  });

  it("releases once the global cooldown has passed", () => {
    const cooldowns = new Cooldowns();
    const roll = command({ globalCooldown: 30 });

    cooldowns.record(roll, "alice", 0);

    expect(cooldowns.isCoolingDown(roll, "alice", 30_000)).toBe(false);
  });

  it("holds one viewer without holding another", () => {
    const cooldowns = new Cooldowns();
    const roll = command({ userCooldown: 60 });

    cooldowns.record(roll, "alice", 0);

    expect(cooldowns.isCoolingDown(roll, "alice", 10_000)).toBe(true);
    expect(cooldowns.isCoolingDown(roll, "bob", 10_000)).toBe(false);
  });

  it("applies whichever cooldown is still running", () => {
    const cooldowns = new Cooldowns();
    const roll = command({ globalCooldown: 5, userCooldown: 60 });

    cooldowns.record(roll, "alice", 0);

    // The global one has passed, the viewer's has not.
    expect(cooldowns.isCoolingDown(roll, "alice", 10_000)).toBe(true);
    expect(cooldowns.isCoolingDown(roll, "bob", 10_000)).toBe(false);
  });

  it("keeps commands apart", () => {
    const cooldowns = new Cooldowns();
    const roll = command({ id: "a", globalCooldown: 30 });
    const hug = command({ id: "b", globalCooldown: 30 });

    cooldowns.record(roll, "alice", 0);

    expect(cooldowns.isCoolingDown(hug, "alice", 1000)).toBe(false);
  });

  it("forgets a command that was deleted", () => {
    const cooldowns = new Cooldowns();
    const roll = command({ globalCooldown: 30, userCooldown: 30 });

    cooldowns.record(roll, "alice", 0);
    cooldowns.forget(roll.id);

    expect(cooldowns.isCoolingDown(roll, "alice", 1000)).toBe(false);
  });
});

import { StandaloneTriggerContext } from "@fluxta/sdk/api";
import { describe, expect, it } from "vitest";

import { SongQueue } from "../songs/song-queue";
import type { VolumeSettings } from "song-requests-protocol";
import { fakeProvider } from "../test-support/fake-provider";
import { VolumeAction } from "./volume";

describe("Volume", () => {
  it("carries volume across Player reconnects and into Songs of another Provider", async () => {
    const first = fakeProvider("first");
    const second = fakeProvider("second");
    let id = 0;
    const queue = new SongQueue({
      providers: [first.provider, second.provider],
      newId: () => `${++id}`,
    });
    first.player.connect();
    second.player.connect();
    await queue.request("first:one@100");
    first.player.load();
    await queue.request("second:two@100");
    new VolumeAction(queue).onTrigger(
      new StandaloneTriggerContext("volume", { mode: "set", amount: "25" }),
    );
    first.player.disconnect();
    first.player.connect();
    expect(first.player.played.at(-1)?.options.volume).toBe(25);
    queue.skip();
    expect(second.player.played.at(-1)?.options.volume).toBe(25);
  });
  it("sets and changes volume through templated amounts, clamped to 0–100", async () => {
    const { provider, player } = fakeProvider();
    const queue = new SongQueue({ providers: [provider], newId: () => "song" });
    player.connect();
    await queue.request("fake:first@100");
    const action = new VolumeAction(queue);
    const run = (mode: "set" | "change", amount: unknown) =>
      action.onTrigger(
        new StandaloneTriggerContext("volume", {
          mode,
          amount,
        } as VolumeSettings),
      );

    expect(run("set", 40)).toEqual({ volume: 40 });
    expect(player.volume).toBe(40);
    expect(run("change", " +15 ")).toEqual({ volume: 55 });
    expect(run("change", "-10")).toEqual({ volume: 45 });
    expect(run("set", "900")).toEqual({ volume: 100 });
    expect(run("change", -200)).toEqual({ volume: 0 });
    for (const value of ["", "no", false, null, {}, Infinity, NaN]) {
      expect(run("set", value)).toEqual({ volume: 0 });
    }
    expect(player.volume).toBe(0);
  });
});

import { StandaloneTriggerContext } from "@fluxta/sdk/api";
import { describe, expect, it } from "vitest";

import { SongQueue } from "../songs/song-queue";
import { fakeProvider } from "../test-support/fake-provider";
import type { Resolution } from "../songs/provider";
import { songQueue } from "../test-support/song-queue";
import { RequestsAction } from "./requests";

describe("Requests", () => {
  it("closes, opens and toggles acceptance while leaving playback running and allowing step Overrides", async () => {
    const { queue, player, request } = songQueue();
    player.connect();
    await request("fake:current@100");
    player.load();
    const action = new RequestsAction(queue);
    expect(
      action.onTrigger(
        new StandaloneTriggerContext("close", { mode: "close" }),
      ),
    ).toEqual({ isOpen: false });
    expect(queue.requestsOpen).toBe(false);
    expect(await request("fake:closed@100")).toEqual({
      kind: "refused",
      reason: "closed",
    });
    expect(queue.status().isPlaying).toBe(true);
    expect(
      await queue.request("fake:override@100", undefined, {
        overrides: { requestsOpen: { mode: "off" } },
      }),
    ).toMatchObject({ kind: "accepted" });
    expect(
      action.onTrigger(new StandaloneTriggerContext("open", { mode: "open" })),
    ).toEqual({ isOpen: true });
    expect(await request("fake:open@100")).toMatchObject({ kind: "accepted" });
    expect(
      action.onTrigger(
        new StandaloneTriggerContext("toggle", { mode: "toggle" }),
      ),
    ).toEqual({ isOpen: false });
    expect(
      action.onTrigger(new StandaloneTriggerContext("toggle", {})),
    ).toEqual({ isOpen: true });
  });
  it("refuses an in-flight Request when Requests close before its Provider answers", async () => {
    const { provider } = fakeProvider();
    const resolution = await provider.resolve("fake:slow@100");
    let complete!: (result: Resolution) => void;
    provider.resolve = () =>
      new Promise((resolve) => {
        complete = resolve;
      });
    const queue = new SongQueue({ providers: [provider], newId: () => "song" });
    const pending = queue.request("fake:slow@100");
    new RequestsAction(queue).onTrigger(
      new StandaloneTriggerContext("close", { mode: "close" }),
    );
    complete(resolution);
    expect(await pending).toEqual({ kind: "refused", reason: "closed" });
    expect(queue.snapshot().waiting).toEqual([]);
  });
});

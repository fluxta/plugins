import { StandaloneTriggerContext } from "@fluxta/sdk/api";
import { afterEach, describe, expect, it, vi } from "vitest";

import { songQueue } from "../test-support/song-queue";
import { GetSongAction } from "./get-song";

afterEach(() => vi.useRealTimers());

describe("Get Song", () => {
  it("answers with the Current Song's public fields, position zero and eta zero", async () => {
    const { queue, player, request } = songQueue();
    player.connect();
    await request("fake:current@100");
    player.load();
    expect(
      new GetSongAction(queue).onTrigger(
        new StandaloneTriggerContext("get", { target: "current" }),
      ),
    ).toEqual({
      songId: "song-1",
      provider: "fake",
      title: "current",
      channel: "Channel",
      duration: 100,
      url: "fake://current",
      requesterPlatform: "twitch",
      requesterId: "42",
      requesterName: "Viewer",
      reference: "redemption",
      position: 0,
      eta: 0,
    });
  });
  it("finds a waiting position or a Requester's next with eta based on remaining playback", async () => {
    vi.useFakeTimers();
    const { queue, player, request } = songQueue();
    player.connect();
    await request("fake:current@100");
    player.load();
    vi.advanceTimersByTime(12_000);
    await request("fake:other-requester@40", "99");
    await request("fake:mine@30");
    await request("other:different-platform@30", "42", "inTurn", "kick");
    const action = new GetSongAction(queue);
    expect(
      action.onTrigger(
        new StandaloneTriggerContext("position", {
          target: "position",
          position: "2",
        }),
      ),
    ).toMatchObject({ title: "mine", position: 2, eta: 128 });
    expect(
      action.onTrigger(
        new StandaloneTriggerContext("requester", {
          target: "requesterNext",
          requesterPlatform: "twitch",
          requesterId: "42",
        }),
      ),
    ).toMatchObject({ title: "mine", position: 2, eta: 128 });
  });

  it("omits an unknown duration and any eta that depends on it", async () => {
    const { queue, request } = songQueue();
    await request("fake:unknown");
    await request("fake:later@100");
    const action = new GetSongAction(queue);
    const first = action.onTrigger(
      new StandaloneTriggerContext("first", {
        target: "position",
        position: "1",
      }),
    );
    expect(first).toMatchObject({ title: "unknown", position: 1, eta: 0 });
    expect(first).not.toHaveProperty("duration");
    const later = action.onTrigger(
      new StandaloneTriggerContext("later", {
        target: "position",
        position: "2",
      }),
    );
    expect(later).toMatchObject({ title: "later", position: 2, duration: 100 });
    expect(later).not.toHaveProperty("eta");
  });

  it("produces no stale Song fields when no target exists", () => {
    const { queue } = songQueue();
    const action = new GetSongAction(queue);
    expect(
      action.onTrigger(new StandaloneTriggerContext("current", {})),
    ).toEqual({});
    expect(
      action.onTrigger(
        new StandaloneTriggerContext("position", {
          target: "position",
          position: "0",
        }),
      ),
    ).toEqual({});
    expect(
      action.onTrigger(
        new StandaloneTriggerContext("requester", {
          target: "requesterNext",
          requesterId: "",
        }),
      ),
    ).toEqual({});
  });
});

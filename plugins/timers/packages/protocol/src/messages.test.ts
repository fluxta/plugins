import { describe, expect, it } from "vitest";

import { isEditorMessage, isPluginMessage } from "./messages";

describe("isEditorMessage", () => {
  it("accepts every message an editor sends", () => {
    for (const message of [
      { event: "get-status" },
      {
        event: "create-timer",
        timer: {
          name: "Grace",
          durationMs: 900_000,
          repeatedStart: "restart",
          repeat: false,
          maxTimes: null,
        },
      },
      {
        event: "update-timer",
        id: "t1",
        timer: {
          name: "Water",
          durationMs: 1_800_000,
          repeatedStart: "ignore",
          repeat: true,
          maxTimes: 4,
        },
      },
      { event: "delete-timer", id: "t1" },
      { event: "create-stopwatch", name: "On air" },
      { event: "rename-stopwatch", id: "s1", name: "Break" },
      { event: "delete-stopwatch", id: "s1" },
    ]) {
      expect(isEditorMessage(message)).toBe(true);
    }
  });

  it("refuses an unknown event or a malformed one", () => {
    expect(isEditorMessage({ event: "start-stopwatch", id: "s1" })).toBe(false);
    expect(isEditorMessage({ event: "create-stopwatch" })).toBe(false);
    expect(
      isEditorMessage({
        event: "create-timer",
        timer: {
          name: "Grace",
          durationMs: 0,
          repeatedStart: "restart",
          repeat: false,
          maxTimes: null,
        },
      }),
    ).toBe(false);
    expect(isEditorMessage({ event: "set-language", language: "ru" })).toBe(
      false,
    );
    expect(isEditorMessage("get-status")).toBe(false);
    expect(isEditorMessage(null)).toBe(false);
  });
});

describe("isPluginMessage", () => {
  it("accepts what the sidecar sends and nothing else", () => {
    expect(
      isPluginMessage({
        event: "status",
        status: { timers: [], stopwatches: [] },
      }),
    ).toBe(true);
    expect(
      isPluginMessage({ event: "refused", of: "timers", message: "…" }),
    ).toBe(true);
    expect(isPluginMessage({ event: "get-status" })).toBe(false);
    expect(isPluginMessage(undefined)).toBe(false);
  });
});

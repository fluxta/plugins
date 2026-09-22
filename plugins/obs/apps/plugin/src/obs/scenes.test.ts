import type { OBSWebSocket } from "obs-websocket-js";
import { describe, expect, it } from "vitest";

import { listSceneSources } from "./scenes";

type StubItem = { sceneItemId: number; sourceName: string; isGroup: boolean | null };

const GROUPS = ["Cameras"];

const ITEMS: Record<string, StubItem[]> = {
  Gameplay: [
    { sceneItemId: 1, sourceName: "Webcam", isGroup: null },
    { sceneItemId: 2, sourceName: "Cameras", isGroup: true },
  ],
  Cameras: [{ sceneItemId: 5, sourceName: "Webcam Front", isGroup: null }],
};

function stubObs(): OBSWebSocket {
  return {
    call: async (type: string, params?: Record<string, unknown>) => {
      const sceneName = String(params?.["sceneName"] ?? "");

      switch (type) {
        case "GetGroupList":
          return { groups: GROUPS };
        case "GetSceneItemList":
          return { sceneItems: ITEMS[sceneName] ?? [] };
        case "GetGroupSceneItemList":
          return { sceneItems: ITEMS[sceneName] ?? [] };
        default:
          throw new Error(`Unexpected request: ${type}`);
      }
    },
  } as unknown as OBSWebSocket;
}

describe("listSceneSources", () => {
  it("keeps the bare Source name as the value and puts a Group's path in the label", async () => {
    expect(await listSceneSources(stubObs(), "Gameplay")).toEqual([
      { value: "Webcam", label: "Webcam" },
      { value: "Cameras", label: "Cameras" },
      { value: "Webcam Front", label: "Cameras / Webcam Front" },
    ]);
  });
});

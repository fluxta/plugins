import type { OBSWebSocket } from "obs-websocket-js";
import { describe, expect, it } from "vitest";

import {
  findSceneItemRef,
  listSceneItemRefs,
  resolveSceneItemChange,
} from "./scene-items";

type StubItem = { sceneItemId: number; sourceName: string; isGroup: boolean | null };

/**
 * One Scene ("Gameplay") holding a direct Input and one Group ("Cameras")
 * whose Inputs are only ever seen through `GetGroupSceneItemList` — mirroring
 * OBS, where neither request answers for the other kind of container. A
 * second Group ("Orphans") is placed in no Scene at all, standing in for the
 * nested Groups the protocol allows but the OBS UI cannot create.
 */
const SCENES = ["Gameplay"];
const GROUPS = ["Cameras", "Orphans"];

const ITEMS: Record<string, StubItem[]> = {
  Gameplay: [
    { sceneItemId: 1, sourceName: "Webcam", isGroup: null },
    { sceneItemId: 2, sourceName: "Cameras", isGroup: true },
  ],
  Cameras: [
    { sceneItemId: 5, sourceName: "Webcam Front", isGroup: null },
    { sceneItemId: 6, sourceName: "Webcam Back", isGroup: null },
  ],
  Orphans: [{ sceneItemId: 9, sourceName: "Lonely", isGroup: null }],
};

function stubObs(): OBSWebSocket {
  return {
    call: async (type: string, params?: Record<string, unknown>) => {
      const sceneName = String(params?.["sceneName"] ?? "");

      switch (type) {
        case "GetGroupList":
          return { groups: GROUPS };
        case "GetSceneList":
          return { scenes: SCENES.map((scene) => ({ sceneName: scene })) };
        case "GetSceneItemList":
          if (GROUPS.includes(sceneName)) {
            throw new Error(`"${sceneName}" is a group`);
          }
          return { sceneItems: ITEMS[sceneName] ?? [] };
        case "GetGroupSceneItemList":
          if (!GROUPS.includes(sceneName)) {
            throw new Error(`"${sceneName}" is not a group`);
          }
          return { sceneItems: ITEMS[sceneName] ?? [] };
        default:
          throw new Error(`Unexpected request: ${type}`);
      }
    },
  } as unknown as OBSWebSocket;
}

describe("listSceneItemRefs", () => {
  it("flattens a Scene, reporting a Group's own item before its contents", async () => {
    expect(await listSceneItemRefs(stubObs(), "Gameplay")).toEqual([
      { container: "Gameplay", source: "Webcam", itemId: 1, path: [] },
      { container: "Gameplay", source: "Cameras", itemId: 2, path: [] },
      { container: "Cameras", source: "Webcam Front", itemId: 5, path: ["Cameras"] },
      { container: "Cameras", source: "Webcam Back", itemId: 6, path: ["Cameras"] },
    ]);
  });

  it("walks a Group root without repeating it in the path", async () => {
    expect(await listSceneItemRefs(stubObs(), "Cameras")).toEqual([
      { container: "Cameras", source: "Webcam Front", itemId: 5, path: [] },
      { container: "Cameras", source: "Webcam Back", itemId: 6, path: [] },
    ]);
  });
});

describe("findSceneItemRef", () => {
  it("finds a Source inside a Group and names the Group as its container", async () => {
    expect(await findSceneItemRef(stubObs(), "Gameplay", "Webcam Back")).toEqual({
      container: "Cameras",
      source: "Webcam Back",
      itemId: 6,
      path: ["Cameras"],
    });
  });

  it("finds a direct child of the Scene itself", async () => {
    expect(await findSceneItemRef(stubObs(), "Gameplay", "Webcam")).toMatchObject({
      container: "Gameplay",
      itemId: 1,
    });
  });

  it("is undefined when the Source is not placed there", async () => {
    expect(await findSceneItemRef(stubObs(), "Gameplay", "Missing")).toBeUndefined();
  });
});

describe("resolveSceneItemChange", () => {
  it("reports the owning Scene for an id inside a Group", async () => {
    expect(await resolveSceneItemChange(stubObs(), "Cameras", 6)).toEqual({
      source: "Webcam Back",
      scenes: ["Gameplay"],
    });
  });

  it("reports the container itself for an id inside a Scene", async () => {
    expect(await resolveSceneItemChange(stubObs(), "Gameplay", 1)).toEqual({
      source: "Webcam",
      scenes: ["Gameplay"],
    });
  });

  it("falls back to a Group's own name when no Scene places it directly", async () => {
    expect(await resolveSceneItemChange(stubObs(), "Orphans", 9)).toEqual({
      source: "Lonely",
      scenes: ["Orphans"],
    });
  });

  it("throws once the placement is gone", async () => {
    await expect(resolveSceneItemChange(stubObs(), "Cameras", 99)).rejects.toThrow(
      'No scene item 99 in "Cameras"',
    );
  });
});

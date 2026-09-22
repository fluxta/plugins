import type { OBSWebSocket } from "obs-websocket-js";
import type { PickerOption } from "obs-protocol";

import { listSceneItemRefs } from "./scene-items";

export async function listScenes(obs: OBSWebSocket): Promise<PickerOption[]> {
  const { scenes } = await obs.call("GetSceneList");
  return scenes.map((scene) => {
    const name = String(scene["sceneName"]);
    return { value: name, label: name };
  });
}

/**
 * Every Source placed in a Scene, including the ones inside its Groups —
 * `GetSceneItemList` answers for Scenes only and names direct children only,
 * so the tree walk does the descending.
 *
 * `value` stays the plain Source name: an Event Filter operand compares it
 * against the event payload, and the Action finds the placement by name
 * either way. The Group path lives in the `label` only, so a Source inside a
 * Group reads as "Cameras / Webcam".
 */
export async function listSceneSources(
  obs: OBSWebSocket,
  scene: string,
): Promise<PickerOption[]> {
  const refs = await listSceneItemRefs(obs, scene);

  return refs.map((ref) => ({
    value: ref.source,
    label: [...ref.path, ref.source].join(" / "),
  }));
}

export async function setCurrentScene(obs: OBSWebSocket, scene: string): Promise<void> {
  await obs.call("SetCurrentProgramScene", { sceneName: scene });
}

export async function getCurrentScene(obs: OBSWebSocket): Promise<string> {
  const { currentProgramSceneName } = await obs.call("GetCurrentProgramScene");
  return currentProgramSceneName;
}

/**
 * `SourceFilterEnableStateChanged` names its target only by name, and that
 * name may belong to a Scene or an Input alike — filters live on both. This
 * tells the two apart so the event can be forwarded as the right one of
 * `scene-filter-enabled-changed` / `source-filter-enabled-changed`.
 */
export async function isScene(obs: OBSWebSocket, name: string): Promise<boolean> {
  const { scenes } = await obs.call("GetSceneList");
  return scenes.some((scene) => scene["sceneName"] === name);
}

import type { OBSWebSocket } from "obs-websocket-js";
import type { PickerOption } from "obs-protocol";

export async function listScenes(obs: OBSWebSocket): Promise<PickerOption[]> {
  const { scenes } = await obs.call("GetSceneList");
  return scenes.map((scene) => {
    const name = String(scene["sceneName"]);
    return { value: name, label: name };
  });
}

export async function listSceneSources(
  obs: OBSWebSocket,
  scene: string,
): Promise<PickerOption[]> {
  const { sceneItems } = await obs.call("GetSceneItemList", { sceneName: scene });
  return sceneItems.map((item) => {
    const name = String(item["sourceName"]);
    return { value: name, label: name };
  });
}

export async function setCurrentScene(obs: OBSWebSocket, scene: string): Promise<void> {
  await obs.call("SetCurrentProgramScene", { sceneName: scene });
}

export async function getCurrentScene(obs: OBSWebSocket): Promise<string> {
  const { currentProgramSceneName } = await obs.call("GetCurrentProgramScene");
  return currentProgramSceneName;
}

import type { OBSWebSocket } from "obs-websocket-js";
import type { PickerOption } from "obs-protocol";

/**
 * Every Input configured on the Connection — cameras, browser sources, audio
 * devices, and so on, regardless of which Scenes (if any) currently place
 * them. Used for Mute/Volume/Filter pickers, which act on a Source directly.
 */
export async function listInputs(obs: OBSWebSocket): Promise<PickerOption[]> {
  const { inputs } = await obs.call("GetInputList");
  return inputs.map((input) => {
    const name = String(input["inputName"]);
    return { value: name, label: name };
  });
}

/**
 * OBS addresses "this Source, placed in this Scene" by a numeric Scene Item
 * id, not by the Source's name — see docs/adr/0002 on why this plugin never
 * names that concept itself. This resolves the id each call rather than
 * caching it: an id is only stable for as long as the placement exists.
 */
async function sceneItemId(obs: OBSWebSocket, scene: string, source: string): Promise<number> {
  const { sceneItemId } = await obs.call("GetSceneItemId", {
    sceneName: scene,
    sourceName: source,
  });
  return sceneItemId;
}

export async function isSourceVisible(
  obs: OBSWebSocket,
  scene: string,
  source: string,
): Promise<boolean> {
  const id = await sceneItemId(obs, scene, source);
  const { sceneItemEnabled } = await obs.call("GetSceneItemEnabled", {
    sceneName: scene,
    sceneItemId: id,
  });
  return sceneItemEnabled;
}

export async function setSourceVisible(
  obs: OBSWebSocket,
  scene: string,
  source: string,
  visible: boolean,
): Promise<void> {
  const id = await sceneItemId(obs, scene, source);
  await obs.call("SetSceneItemEnabled", {
    sceneName: scene,
    sceneItemId: id,
    sceneItemEnabled: visible,
  });
}

/** The reverse lookup: what `SceneItemEnableStateChanged` gives us is an id, never a name. */
export async function sourceNameForSceneItem(
  obs: OBSWebSocket,
  scene: string,
  sceneItemId: number,
): Promise<string> {
  const { sourceName } = await obs.call("GetSceneItemSource", {
    sceneName: scene,
    sceneItemId,
  });
  return sourceName;
}

export const SCENE_CHANGED_EVENT = "scene-changed";

/** Every field declared for `scene-changed` in the manifest. */
export type SceneChangedPayload = {
  connection: string;
  scene_name: string;
};

export function toSceneChangedPayload(connectionId: string, sceneName: string): SceneChangedPayload {
  return {
    connection: connectionId,
    scene_name: sceneName,
  };
}

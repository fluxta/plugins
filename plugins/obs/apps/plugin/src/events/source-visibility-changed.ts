export const SOURCE_VISIBILITY_CHANGED_EVENT = "source-visibility-changed";

/** Every field declared for `source-visibility-changed` in the manifest. */
export type SourceVisibilityChangedPayload = {
  connection: string;
  scene_name: string;
  source_name: string;
  visible: boolean;
};

export function toSourceVisibilityChangedPayload(
  connectionId: string,
  sceneName: string,
  sourceName: string,
  visible: boolean,
): SourceVisibilityChangedPayload {
  return {
    connection: connectionId,
    scene_name: sceneName,
    source_name: sourceName,
    visible,
  };
}

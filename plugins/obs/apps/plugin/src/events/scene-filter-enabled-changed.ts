export const SCENE_FILTER_ENABLED_CHANGED_EVENT = "scene-filter-enabled-changed";

/**
 * Every field declared for `scene-filter-enabled-changed` in the manifest.
 *
 * A Filter attached to a Scene itself, not to a Source placed on it — see
 * {@link SetSceneFilterAction}. Mirrors `source-filter-enabled-changed`,
 * just keyed by `sceneName` instead of `sourceName`.
 */
export type SceneFilterEnabledChangedPayload = {
  connection: string;
  sceneName: string;
  filterName: string;
  enabled: boolean;
};

export function toSceneFilterEnabledChangedPayload(
  connectionId: string,
  sceneName: string,
  filterName: string,
  enabled: boolean,
): SceneFilterEnabledChangedPayload {
  return {
    connection: connectionId,
    sceneName,
    filterName,
    enabled,
  };
}

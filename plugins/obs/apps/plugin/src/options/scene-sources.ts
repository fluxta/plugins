import type { Options, OptionsContext } from "@fluxta/sdk/api";

import type { ConnectionsService } from "../connections/service";
import { listSceneSources } from "../obs/scenes";
import { stringArg } from "./args";

export const SCENE_SOURCES_OPTIONS = "scene-sources";

/**
 * The Sources placed within one Scene — backs a `source_name` Event Field
 * operand that should narrow by its sibling `scene_name` Field (currently
 * just `source-visibility-changed`, the only Source-related event where a
 * Scene is a genuine, always-present part of what fired: a Scene Item is
 * always exactly one (Scene, Source) pair). Reads `scene_name` out of its
 * own `args`, populated only once that sibling Field is itself filtered in
 * the same Event Filter row (docs/adr/0004); until then this resolves to an
 * empty list, same as an offline Connection would.
 */
export function createSceneSourcesOptions(connections: ConnectionsService): Options {
  return {
    key: SCENE_SOURCES_OPTIONS,
    resolve: async (ctx: OptionsContext) => {
      const connectionId = stringArg(ctx.args, "connection");
      const scene = stringArg(ctx.args, "scene_name");
      const obs = connectionId ? connections.obsOf(connectionId) : undefined;

      if (!obs || !scene) {
        return [];
      }

      try {
        return await listSceneSources(obs, scene);
      } catch (error) {
        console.warn("Scene sources could not be listed:", error);
        return [];
      }
    },
  };
}

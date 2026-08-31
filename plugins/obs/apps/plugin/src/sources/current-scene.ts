import type { Source, SourceContext } from "@fluxta/sdk/api";

import type { ConnectionsService } from "../connections/service";
import { connectionArg } from "./args";
import { getCurrentScene } from "../obs/scenes";

export const CURRENT_SCENE_SOURCE = "current-scene";

/** Pull Value Source: the given Connection's current program Scene name. */
export function createCurrentSceneSource(connections: ConnectionsService): Source {
  return {
    key: CURRENT_SCENE_SOURCE,
    resolve: async (ctx: SourceContext) => {
      const connectionId = connectionArg(ctx.args) ?? connections.soleId();
      const obs = connectionId ? connections.obsOf(connectionId) : undefined;

      if (!obs) {
        return null;
      }

      try {
        return await getCurrentScene(obs);
      } catch (error) {
        console.warn("Current Scene could not be resolved:", error);
        return null;
      }
    },
  };
}

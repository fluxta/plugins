import type { Options, OptionsContext } from "@fluxta/sdk/api";

import type { ConnectionsService } from "../connections/service";
import { listScenes } from "../obs/scenes";
import { stringArg } from "./args";

export const SCENES_OPTIONS = "scenes";

/** The chosen Connection's live Scenes — backs `obs.current-scene`'s operand and `scene_name` Event Field operands. */
export function createScenesOptions(connections: ConnectionsService): Options {
  return {
    key: SCENES_OPTIONS,
    resolve: async (ctx: OptionsContext) => {
      const connectionId = stringArg(ctx.args, "connection");
      const obs = connectionId ? connections.obsOf(connectionId) : undefined;

      if (!obs) {
        return [];
      }

      try {
        return await listScenes(obs);
      } catch (error) {
        console.warn("Scenes could not be listed:", error);
        return [];
      }
    },
  };
}

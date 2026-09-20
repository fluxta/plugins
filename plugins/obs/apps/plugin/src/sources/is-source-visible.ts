import type { Source, SourceContext } from "@fluxta/sdk/api";

import type { ConnectionsService } from "../connections/service";
import { stringArg } from "../options/args";
import { isSourceVisible } from "../obs/sources";
import { connectionArg } from "./args";

export const IS_SOURCE_VISIBLE_SOURCE = "isSourceVisible";

/** Pull Value Source: is the given Scene Item currently shown? */
export function createIsSourceVisibleSource(connections: ConnectionsService): Source {
  return {
    key: IS_SOURCE_VISIBLE_SOURCE,
    resolve: async (ctx: SourceContext) => {
      const connectionId = connectionArg(ctx.args) ?? connections.soleId();
      const obs = connectionId ? connections.obsOf(connectionId) : undefined;
      const scene = stringArg(ctx.args, "sceneName");
      const source = stringArg(ctx.args, "sourceName");

      if (!obs || !scene || !source) {
        return null;
      }

      try {
        return await isSourceVisible(obs, scene, source);
      } catch (error) {
        console.warn("Is Source Visible could not be resolved:", error);
        return null;
      }
    },
  };
}

import type { Options, OptionsContext } from "@fluxta/sdk/api";

import type { ConnectionsService } from "../connections/service";
import { listFilters } from "../obs/filters";
import { stringArg } from "./args";

export const SCENE_FILTERS_OPTIONS = "scene-filters";

/**
 * The chosen Scene's live Filters — backs `filterName` on
 * `scene-filter-enabled-changed`. A twin of `createFiltersOptions`, reading
 * `sceneName` instead of `sourceName`: `listFilters` is source-name-generic
 * (a Scene is a Source under the hood), so only the sibling arg key differs.
 */
export function createSceneFiltersOptions(connections: ConnectionsService): Options {
  return {
    key: SCENE_FILTERS_OPTIONS,
    resolve: async (ctx: OptionsContext) => {
      const connectionId = stringArg(ctx.args, "connection");
      const scene = stringArg(ctx.args, "sceneName");
      const obs = connectionId ? connections.obsOf(connectionId) : undefined;

      if (!obs || !scene) {
        return [];
      }

      try {
        return await listFilters(obs, scene);
      } catch (error) {
        console.warn("Scene filters could not be listed:", error);
        return [];
      }
    },
  };
}

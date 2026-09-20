import type { Source, SourceContext } from "@fluxta/sdk/api";

import type { ConnectionsService } from "../connections/service";
import { stringArg } from "../options/args";
import { isFilterEnabled } from "../obs/filters";
import { connectionArg } from "./args";

export const IS_FILTER_ENABLED_SOURCE = "isFilterEnabled";

/** Pull Value Source: is the given Filter on the given Source currently enabled? */
export function createIsFilterEnabledSource(connections: ConnectionsService): Source {
  return {
    key: IS_FILTER_ENABLED_SOURCE,
    resolve: async (ctx: SourceContext) => {
      const connectionId = connectionArg(ctx.args) ?? connections.soleId();
      const obs = connectionId ? connections.obsOf(connectionId) : undefined;
      const source = stringArg(ctx.args, "sourceName");
      const filter = stringArg(ctx.args, "filterName");

      if (!obs || !source || !filter) {
        return null;
      }

      try {
        return await isFilterEnabled(obs, source, filter);
      } catch (error) {
        console.warn("Is Filter Enabled could not be resolved:", error);
        return null;
      }
    },
  };
}

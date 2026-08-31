import type { Options, OptionsContext } from "@fluxta/sdk/api";

import type { ConnectionsService } from "../connections/service";
import { listFilters } from "../obs/filters";
import { stringArg } from "./args";

export const FILTERS_OPTIONS = "filters";

/**
 * The chosen Source's live Filters — backs the `filter_name` Event Field
 * operand on `source-filter-enabled-changed`. Reads `source_name` out of its
 * own `args`, which the host only populates once that sibling Field is
 * itself filtered in the same Event Filter row (docs/adr/0004); until then
 * this resolves to an empty list, same as an offline Connection would.
 */
export function createFiltersOptions(connections: ConnectionsService): Options {
  return {
    key: FILTERS_OPTIONS,
    resolve: async (ctx: OptionsContext) => {
      const connectionId = stringArg(ctx.args, "connection");
      const source = stringArg(ctx.args, "source_name");
      const obs = connectionId ? connections.obsOf(connectionId) : undefined;

      if (!obs || !source) {
        return [];
      }

      try {
        return await listFilters(obs, source);
      } catch (error) {
        console.warn("Filters could not be listed:", error);
        return [];
      }
    },
  };
}

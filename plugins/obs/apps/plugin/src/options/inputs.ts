import type { Options, OptionsContext } from "@fluxta/sdk/api";

import type { ConnectionsService } from "../connections/service";
import { listInputs } from "../obs/sources";
import { stringArg } from "./args";

export const INPUTS_OPTIONS = "inputs";

/** The chosen Connection's live Sources — backs `source_name`/`input_name` Event Field operands. */
export function createInputsOptions(connections: ConnectionsService): Options {
  return {
    key: INPUTS_OPTIONS,
    resolve: async (ctx: OptionsContext) => {
      const connectionId = stringArg(ctx.args, "connection");
      const obs = connectionId ? connections.obsOf(connectionId) : undefined;

      if (!obs) {
        return [];
      }

      try {
        return await listInputs(obs);
      } catch (error) {
        console.warn("Inputs could not be listed:", error);
        return [];
      }
    },
  };
}

import type { Source, SourceContext } from "@fluxta/sdk/api";

import type { ConnectionsService } from "../connections/service";
import { stringArg } from "../options/args";
import { getInputVolumePercent } from "../obs/inputs";
import { connectionArg } from "./args";

export const INPUT_VOLUME_SOURCE = "inputVolume";

/** Pull Value Source: the given Input's volume, as a percent (matches OBS's own mixer). */
export function createInputVolumeSource(connections: ConnectionsService): Source {
  return {
    key: INPUT_VOLUME_SOURCE,
    resolve: async (ctx: SourceContext) => {
      const connectionId = connectionArg(ctx.args) ?? connections.soleId();
      const obs = connectionId ? connections.obsOf(connectionId) : undefined;
      const input = stringArg(ctx.args, "inputName");

      if (!obs || !input) {
        return null;
      }

      try {
        return await getInputVolumePercent(obs, input);
      } catch (error) {
        console.warn("Input Volume could not be resolved:", error);
        return null;
      }
    },
  };
}

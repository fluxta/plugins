import type { Source, SourceContext } from "@fluxta/sdk/api";

import type { ConnectionsService } from "../connections/service";
import { connectionArg } from "./args";
import { recordStatus } from "../obs/record";

export const IS_RECORDING_SOURCE = "is-recording";

/** Pull Value Source: is the given Connection currently recording (paused or not)? */
export function createIsRecordingSource(connections: ConnectionsService): Source {
  return {
    key: IS_RECORDING_SOURCE,
    resolve: async (ctx: SourceContext) => {
      const connectionId = connectionArg(ctx.args) ?? connections.soleId();
      const obs = connectionId ? connections.obsOf(connectionId) : undefined;

      if (!obs) {
        return null;
      }

      try {
        const { active } = await recordStatus(obs);
        return active;
      } catch (error) {
        console.warn("Is Recording could not be resolved:", error);
        return null;
      }
    },
  };
}

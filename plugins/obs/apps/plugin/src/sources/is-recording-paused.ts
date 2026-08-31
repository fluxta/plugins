import type { Source, SourceContext } from "@fluxta/sdk/api";

import type { ConnectionsService } from "../connections/service";
import { connectionArg } from "./args";
import { recordStatus } from "../obs/record";

export const IS_RECORDING_PAUSED_SOURCE = "is-recording-paused";

/** Pull Value Source: is the given Connection's Recording currently paused? */
export function createIsRecordingPausedSource(connections: ConnectionsService): Source {
  return {
    key: IS_RECORDING_PAUSED_SOURCE,
    resolve: async (ctx: SourceContext) => {
      const connectionId = connectionArg(ctx.args) ?? connections.soleId();
      const obs = connectionId ? connections.obsOf(connectionId) : undefined;

      if (!obs) {
        return null;
      }

      try {
        const { paused } = await recordStatus(obs);
        return paused;
      } catch (error) {
        console.warn("Is Recording Paused could not be resolved:", error);
        return null;
      }
    },
  };
}

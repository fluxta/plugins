import type { Source, SourceContext } from "@fluxta/sdk/api";

import type { ConnectionsService } from "../connections/service";
import { connectionArg } from "./args";
import { isStreaming } from "../obs/stream";

export const IS_STREAMING_SOURCE = "is-streaming";

/** Pull Value Source: is the given Connection currently streaming? */
export function createIsStreamingSource(connections: ConnectionsService): Source {
  return {
    key: IS_STREAMING_SOURCE,
    resolve: async (ctx: SourceContext) => {
      const connectionId = connectionArg(ctx.args) ?? connections.soleId();
      const obs = connectionId ? connections.obsOf(connectionId) : undefined;

      if (!obs) {
        return null;
      }

      try {
        return await isStreaming(obs);
      } catch (error) {
        console.warn("Is Streaming could not be resolved:", error);
        return null;
      }
    },
  };
}

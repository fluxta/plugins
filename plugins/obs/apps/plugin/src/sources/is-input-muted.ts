import type { Source, SourceContext } from "@fluxta/sdk/api";

import type { ConnectionsService } from "../connections/service";
import { stringArg } from "../options/args";
import { isInputMuted } from "../obs/inputs";
import { connectionArg } from "./args";

export const IS_INPUT_MUTED_SOURCE = "isInputMuted";

/** Pull Value Source: is the given Input currently muted? */
export function createIsInputMutedSource(connections: ConnectionsService): Source {
  return {
    key: IS_INPUT_MUTED_SOURCE,
    resolve: async (ctx: SourceContext) => {
      const connectionId = connectionArg(ctx.args) ?? connections.soleId();
      const obs = connectionId ? connections.obsOf(connectionId) : undefined;
      const input = stringArg(ctx.args, "inputName");

      if (!obs || !input) {
        return null;
      }

      try {
        return await isInputMuted(obs, input);
      } catch (error) {
        console.warn("Is Input Muted could not be resolved:", error);
        return null;
      }
    },
  };
}

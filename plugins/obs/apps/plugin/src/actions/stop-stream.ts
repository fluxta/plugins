import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { StopStreamSettings } from "obs-protocol";

import type { ConnectionsService } from "../connections/service";
import { resolveObs } from "../connections/resolve";
import { stopStream } from "../obs/stream";

export const STOP_STREAM_ACTION = "stop-stream";

export class StopStreamAction extends StandaloneAction<StopStreamSettings> {
  name = STOP_STREAM_ACTION;

  constructor(private readonly connections: ConnectionsService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<StopStreamSettings>): Promise<void> => {
    const obs = resolveObs(this.connections, ctx.settings);

    if (!obs) {
      console.warn("Stop Stream ran with no matching Connection configured");
      return;
    }

    try {
      await stopStream(obs);
    } catch (error) {
      console.warn("Stop Stream failed:", error);
    }
  };
}

import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { StartStreamSettings } from "obs-protocol";

import type { ConnectionsService } from "../connections/service";
import { resolveObs } from "../connections/resolve";
import { startStream } from "../obs/stream";

export const START_STREAM_ACTION = "start-stream";

export class StartStreamAction extends StandaloneAction<StartStreamSettings> {
  name = START_STREAM_ACTION;

  constructor(private readonly connections: ConnectionsService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<StartStreamSettings>): Promise<void> => {
    const obs = resolveObs(this.connections, ctx.settings);

    if (!obs) {
      console.warn("Start Stream ran with no matching Connection configured");
      return;
    }

    try {
      await startStream(obs);
    } catch (error) {
      console.warn("Start Stream failed:", error);
    }
  };
}

import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { StopRecordSettings } from "obs-protocol";

import type { ConnectionsService } from "../connections/service";
import { resolveObs } from "../connections/resolve";
import { stopRecord } from "../obs/record";

export const STOP_RECORD_ACTION = "stop-record";

export class StopRecordAction extends StandaloneAction<StopRecordSettings> {
  name = STOP_RECORD_ACTION;

  constructor(private readonly connections: ConnectionsService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<StopRecordSettings>): Promise<void> => {
    const obs = resolveObs(this.connections, ctx.settings);

    if (!obs) {
      console.warn("Stop Record ran with no matching Connection configured");
      return;
    }

    try {
      await stopRecord(obs);
    } catch (error) {
      console.warn("Stop Record failed:", error);
    }
  };
}

import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { PauseRecordSettings } from "obs-protocol";

import type { ConnectionsService } from "../connections/service";
import { resolveObs } from "../connections/resolve";
import { pauseRecord } from "../obs/record";

export const PAUSE_RECORD_ACTION = "pause-record";

export class PauseRecordAction extends StandaloneAction<PauseRecordSettings> {
  name = PAUSE_RECORD_ACTION;

  constructor(private readonly connections: ConnectionsService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<PauseRecordSettings>): Promise<void> => {
    const obs = resolveObs(this.connections, ctx.settings);

    if (!obs) {
      console.warn("Pause Record ran with no matching Connection configured");
      return;
    }

    try {
      await pauseRecord(obs);
    } catch (error) {
      console.warn("Pause Record failed:", error);
    }
  };
}

import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { StartRecordSettings } from "obs-protocol";

import type { ConnectionsService } from "../connections/service";
import { resolveObs } from "../connections/resolve";
import { startRecord } from "../obs/record";

export const START_RECORD_ACTION = "start-record";

export class StartRecordAction extends StandaloneAction<StartRecordSettings> {
  name = START_RECORD_ACTION;

  constructor(private readonly connections: ConnectionsService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<StartRecordSettings>): Promise<void> => {
    const obs = resolveObs(this.connections, ctx.settings);

    if (!obs) {
      console.warn("Start Record ran with no matching Connection configured");
      return;
    }

    try {
      await startRecord(obs);
    } catch (error) {
      console.warn("Start Record failed:", error);
    }
  };
}

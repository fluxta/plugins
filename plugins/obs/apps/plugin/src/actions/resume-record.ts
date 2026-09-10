import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { ResumeRecordSettings } from "obs-protocol";

import type { ConnectionsService } from "../connections/service";
import { resolveObs } from "../connections/resolve";
import { resumeRecord } from "../obs/record";

export const RESUME_RECORD_ACTION = "resume-record";

export class ResumeRecordAction extends StandaloneAction<ResumeRecordSettings> {
  name = RESUME_RECORD_ACTION;

  constructor(private readonly connections: ConnectionsService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<ResumeRecordSettings>): Promise<void> => {
    const obs = resolveObs(this.connections, ctx.settings);

    if (!obs) {
      console.warn("Resume Record ran with no matching Connection configured");
      return;
    }

    try {
      await resumeRecord(obs);
    } catch (error) {
      console.warn("Resume Record failed:", error);
    }
  };
}

import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { SetInputVolumeSettings } from "obs-protocol";

import type { ConnectionsService } from "../connections/service";
import { resolveObs } from "../connections/resolve";
import { setInputVolumePercent } from "../obs/inputs";

export const SET_INPUT_VOLUME_ACTION = "set-input-volume";

export class SetInputVolumeAction extends StandaloneAction<SetInputVolumeSettings> {
  name = SET_INPUT_VOLUME_ACTION;

  constructor(private readonly connections: ConnectionsService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<SetInputVolumeSettings>): Promise<void> => {
    const input = ctx.settings.input?.trim();
    const percent = ctx.settings.volumePercent;

    if (!input || typeof percent !== "number" || Number.isNaN(percent)) {
      console.warn("Set Input Volume ran with no Input/volume configured");
      return;
    }

    const obs = resolveObs(this.connections, ctx.settings);

    if (!obs) {
      console.warn("Set Input Volume ran with no matching Connection configured");
      return;
    }

    try {
      await setInputVolumePercent(obs, input, percent);
    } catch (error) {
      console.warn(`Set Input Volume could not update "${input}":`, error);
    }
  };
}

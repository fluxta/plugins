import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { MuteInputSettings } from "obs-protocol";

import type { ConnectionsService } from "../connections/service";
import { resolveObs } from "../connections/resolve";
import { setInputMuted } from "../obs/inputs";

export const MUTE_INPUT_ACTION = "mute-input";

export class MuteInputAction extends StandaloneAction<MuteInputSettings> {
  name = MUTE_INPUT_ACTION;

  constructor(private readonly connections: ConnectionsService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<MuteInputSettings>): Promise<void> => {
    const input = ctx.settings.input?.trim();

    if (!input) {
      console.warn("Mute Input ran with no Input configured");
      return;
    }

    const obs = resolveObs(this.connections, ctx.settings);

    if (!obs) {
      console.warn("Mute Input ran with no matching Connection configured");
      return;
    }

    try {
      await setInputMuted(obs, input, true);
    } catch (error) {
      console.warn(`Mute Input could not mute "${input}":`, error);
    }
  };
}

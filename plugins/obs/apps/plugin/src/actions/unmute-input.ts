import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { UnmuteInputSettings } from "obs-protocol";

import type { ConnectionsService } from "../connections/service";
import { resolveObs } from "../connections/resolve";
import { setInputMuted } from "../obs/inputs";

export const UNMUTE_INPUT_ACTION = "unmute-input";

export class UnmuteInputAction extends StandaloneAction<UnmuteInputSettings> {
  name = UNMUTE_INPUT_ACTION;

  constructor(private readonly connections: ConnectionsService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<UnmuteInputSettings>): Promise<void> => {
    const input = ctx.settings.input?.trim();

    if (!input) {
      console.warn("Unmute Input ran with no Input configured");
      return;
    }

    const obs = resolveObs(this.connections, ctx.settings);

    if (!obs) {
      console.warn("Unmute Input ran with no matching Connection configured");
      return;
    }

    try {
      await setInputMuted(obs, input, false);
    } catch (error) {
      console.warn(`Unmute Input could not unmute "${input}":`, error);
    }
  };
}

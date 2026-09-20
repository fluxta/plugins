import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { SetColorSourceSettings } from "obs-protocol";

import type { ConnectionsService } from "../connections/service";
import { resolveObs } from "../connections/resolve";
import { hexToObsColor, randomObsColor } from "../obs/color";
import { setInputColor } from "../obs/inputs";

export const SET_COLOR_SOURCE_ACTION = "set-color-source";

export class SetColorSourceAction extends StandaloneAction<SetColorSourceSettings> {
  type = SET_COLOR_SOURCE_ACTION;

  constructor(private readonly connections: ConnectionsService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<SetColorSourceSettings>): Promise<void> => {
    const input = ctx.settings.input?.trim();
    const mode = ctx.settings.mode;

    if (!input || !mode) {
      console.warn("Set Color Source ran with no Input/mode configured");
      return;
    }

    if (mode === "fixed" && !ctx.settings.color?.trim()) {
      console.warn("Set Color Source ran with mode \"fixed\" but no color configured");
      return;
    }

    const obs = resolveObs(this.connections, ctx.settings);

    if (!obs) {
      console.warn("Set Color Source ran with no matching Connection configured");
      return;
    }

    try {
      const color =
        mode === "random" ? randomObsColor() : hexToObsColor(ctx.settings.color!.trim());
      await setInputColor(obs, input, color);
    } catch (error) {
      console.warn(`Set Color Source could not update "${input}":`, error);
    }
  };
}

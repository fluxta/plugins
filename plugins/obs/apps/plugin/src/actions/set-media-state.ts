import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { SetMediaStateSettings } from "obs-protocol";

import type { ConnectionsService } from "../connections/service";
import { resolveObs } from "../connections/resolve";
import { triggerMediaAction } from "../obs/media";

export const SET_MEDIA_STATE_ACTION = "set-media-state";

/** Play/pause/stop/restart/next/previous on a Media Source. */
export class SetMediaStateAction extends StandaloneAction<SetMediaStateSettings> {
  type = SET_MEDIA_STATE_ACTION;

  constructor(private readonly connections: ConnectionsService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<SetMediaStateSettings>): Promise<void> => {
    const input = ctx.settings.input?.trim();
    const mode = ctx.settings.mode;

    if (!input || !mode) {
      console.warn("Set Media State ran with no Input/mode configured");
      return;
    }

    const obs = resolveObs(this.connections, ctx.settings);

    if (!obs) {
      console.warn("Set Media State ran with no matching Connection configured");
      return;
    }

    try {
      await triggerMediaAction(obs, input, mode);
    } catch (error) {
      console.warn(`Set Media State could not "${mode}" "${input}":`, error);
    }
  };
}

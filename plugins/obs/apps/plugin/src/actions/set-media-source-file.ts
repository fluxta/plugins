import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { SetMediaSourceFileSettings } from "obs-protocol";

import type { ConnectionsService } from "../connections/service";
import { resolveObs } from "../connections/resolve";
import { setMediaSourceFile } from "../obs/media";

export const SET_MEDIA_SOURCE_FILE_ACTION = "set-media-source-file";

/** Swaps which file a Media/Image Source points to — distinct from controlling its playback. */
export class SetMediaSourceFileAction extends StandaloneAction<SetMediaSourceFileSettings> {
  type = SET_MEDIA_SOURCE_FILE_ACTION;

  constructor(private readonly connections: ConnectionsService) {
    super();
  }

  onTrigger = async (
    ctx: StandaloneTriggerContext<SetMediaSourceFileSettings>,
  ): Promise<void> => {
    const input = ctx.settings.input?.trim();
    const path = ctx.settings.path?.trim();

    if (!input || !path) {
      console.warn("Set Media/Image Source File ran with no Input/path configured");
      return;
    }

    const obs = resolveObs(this.connections, ctx.settings);

    if (!obs) {
      console.warn("Set Media/Image Source File ran with no matching Connection configured");
      return;
    }

    try {
      await setMediaSourceFile(obs, input, path);
    } catch (error) {
      console.warn(`Set Media/Image Source File could not update "${input}":`, error);
    }
  };
}

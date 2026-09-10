import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { SetSourceVisibilitySettings } from "obs-protocol";

import type { ConnectionsService } from "../connections/service";
import { resolveObs } from "../connections/resolve";
import { resolveMode } from "../obs/mode";
import { isSourceVisible, setSourceVisible } from "../obs/sources";

export const SET_SOURCE_VISIBILITY_ACTION = "set-source-visibility";

/**
 * Shows, hides, or flips a Source's visibility within one Scene. Unlike
 * Stream/Record/Mute, this ships a "toggle" mode alongside show/hide — the
 * two groups are inconsistent on purpose.
 */
export class SetSourceVisibilityAction extends StandaloneAction<SetSourceVisibilitySettings> {
  name = SET_SOURCE_VISIBILITY_ACTION;

  constructor(private readonly connections: ConnectionsService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<SetSourceVisibilitySettings>): Promise<void> => {
    const scene = ctx.settings.scene?.trim();
    const source = ctx.settings.source?.trim();

    if (!scene || !source) {
      console.warn("Set Source Visibility ran with no Scene/Source configured");
      return;
    }

    const obs = resolveObs(this.connections, ctx.settings);

    if (!obs) {
      console.warn("Set Source Visibility ran with no matching Connection configured");
      return;
    }

    try {
      const visible = await resolveMode(ctx.settings.mode, () => isSourceVisible(obs, scene, source));

      if (visible === undefined) {
        console.warn("Set Source Visibility ran with no mode configured");
        return;
      }

      await setSourceVisible(obs, scene, source, visible);
    } catch (error) {
      console.warn(`Set Source Visibility could not update "${source}" in "${scene}":`, error);
    }
  };
}

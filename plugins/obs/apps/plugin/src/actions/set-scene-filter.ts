import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { SetSceneFilterSettings } from "obs-protocol";

import type { ConnectionsService } from "../connections/service";
import { resolveObs } from "../connections/resolve";
import { isFilterEnabled, setFilterEnabled } from "../obs/filters";
import { resolveMode } from "../obs/mode";

export const SET_SCENE_FILTER_ACTION = "set-scene-filter";

/**
 * Enables, disables, or flips a Filter attached to a Scene itself — not to a
 * Source placed on it (that's {@link SetSourceFilterAction}). obs-websocket
 * addresses both the same way (a Scene is a Source under the hood), so this
 * reuses `obs/filters.ts` unchanged, passing the Scene's own name.
 */
export class SetSceneFilterAction extends StandaloneAction<SetSceneFilterSettings> {
  type = SET_SCENE_FILTER_ACTION;

  constructor(private readonly connections: ConnectionsService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<SetSceneFilterSettings>): Promise<void> => {
    const scene = ctx.settings.scene?.trim();
    const filter = ctx.settings.filter?.trim();

    if (!scene || !filter) {
      console.warn("Set Scene Filter ran with no Scene/Filter configured");
      return;
    }

    const obs = resolveObs(this.connections, ctx.settings);

    if (!obs) {
      console.warn("Set Scene Filter ran with no matching Connection configured");
      return;
    }

    try {
      const enabled = await resolveMode(ctx.settings.mode, () => isFilterEnabled(obs, scene, filter));

      if (enabled === undefined) {
        console.warn("Set Scene Filter ran with no mode configured");
        return;
      }

      await setFilterEnabled(obs, scene, filter, enabled);
    } catch (error) {
      console.warn(`Set Scene Filter could not update "${filter}" on "${scene}":`, error);
    }
  };
}

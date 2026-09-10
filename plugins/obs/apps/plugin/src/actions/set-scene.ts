import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { SetSceneSettings } from "obs-protocol";

import type { ConnectionsService } from "../connections/service";
import { resolveObs } from "../connections/resolve";
import { setCurrentScene } from "../obs/scenes";

export const SET_SCENE_ACTION = "set-scene";

/** Switches the Connection's current program Scene. */
export class SetSceneAction extends StandaloneAction<SetSceneSettings> {
  name = SET_SCENE_ACTION;

  constructor(private readonly connections: ConnectionsService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<SetSceneSettings>): Promise<void> => {
    const scene = ctx.settings.scene?.trim();

    if (!scene) {
      console.warn("Set Current Program Scene ran with no Scene configured");
      return;
    }

    const obs = resolveObs(this.connections, ctx.settings);

    if (!obs) {
      console.warn("Set Current Program Scene ran with no matching Connection configured");
      return;
    }

    try {
      await setCurrentScene(obs, scene);
    } catch (error) {
      console.warn(`Set Current Program Scene could not switch to "${scene}":`, error);
    }
  };
}

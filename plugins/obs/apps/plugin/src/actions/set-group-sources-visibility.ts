import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { SetGroupSourcesVisibilitySettings } from "obs-protocol";

import type { ConnectionsService } from "../connections/service";
import { resolveObs } from "../connections/resolve";
import { isGroupVisible, setGroupVisible } from "../obs/groups";
import { resolveMode } from "../obs/mode";

export const SET_GROUP_SOURCES_VISIBILITY_ACTION = "set-group-sources-visibility";

/** Shows, hides, or flips every Source inside a Group at once. */
export class SetGroupSourcesVisibilityAction extends StandaloneAction<SetGroupSourcesVisibilitySettings> {
  type = SET_GROUP_SOURCES_VISIBILITY_ACTION;

  constructor(private readonly connections: ConnectionsService) {
    super();
  }

  onTrigger = async (
    ctx: StandaloneTriggerContext<SetGroupSourcesVisibilitySettings>,
  ): Promise<void> => {
    const group = ctx.settings.group?.trim();

    if (!group) {
      console.warn("Set Group's Sources Visibility ran with no Group configured");
      return;
    }

    const obs = resolveObs(this.connections, ctx.settings);

    if (!obs) {
      console.warn("Set Group's Sources Visibility ran with no matching Connection configured");
      return;
    }

    try {
      const visible = await resolveMode(ctx.settings.mode, () => isGroupVisible(obs, group));

      if (visible === undefined) {
        console.warn("Set Group's Sources Visibility ran with no mode configured");
        return;
      }

      await setGroupVisible(obs, group, visible);
    } catch (error) {
      console.warn(`Set Group's Sources Visibility could not update "${group}":`, error);
    }
  };
}

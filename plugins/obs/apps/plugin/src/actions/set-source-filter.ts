import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { SetSourceFilterSettings } from "obs-protocol";

import type { ConnectionsService } from "../connections/service";
import { resolveObs } from "../connections/resolve";
import { isFilterEnabled, setFilterEnabled } from "../obs/filters";
import { resolveMode } from "../obs/mode";

export const SET_SOURCE_FILTER_ACTION = "set-source-filter";

/**
 * Enables, disables, or flips a Filter on a Source. Ships a "toggle" mode
 * alongside enable/disable — Source/Filter visibility diverges from
 * Stream/Record/Mute on this.
 */
export class SetSourceFilterAction extends StandaloneAction<SetSourceFilterSettings> {
  name = SET_SOURCE_FILTER_ACTION;

  constructor(private readonly connections: ConnectionsService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<SetSourceFilterSettings>): Promise<void> => {
    const source = ctx.settings.source?.trim();
    const filter = ctx.settings.filter?.trim();

    if (!source || !filter) {
      console.warn("Set Source Filter ran with no Source/Filter configured");
      return;
    }

    const obs = resolveObs(this.connections, ctx.settings);

    if (!obs) {
      console.warn("Set Source Filter ran with no matching Connection configured");
      return;
    }

    try {
      const enabled = await resolveMode(ctx.settings.mode, () => isFilterEnabled(obs, source, filter));

      if (enabled === undefined) {
        console.warn("Set Source Filter ran with no mode configured");
        return;
      }

      await setFilterEnabled(obs, source, filter, enabled);
    } catch (error) {
      console.warn(`Set Source Filter could not update "${filter}" on "${source}":`, error);
    }
  };
}

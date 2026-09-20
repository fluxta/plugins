import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { SetTextSourceSettings } from "obs-protocol";

import type { ConnectionsService } from "../connections/service";
import { resolveObs } from "../connections/resolve";
import { setInputText } from "../obs/inputs";

export const SET_TEXT_SOURCE_ACTION = "set-text-source";

export class SetTextSourceAction extends StandaloneAction<SetTextSourceSettings> {
  type = SET_TEXT_SOURCE_ACTION;

  constructor(private readonly connections: ConnectionsService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<SetTextSourceSettings>): Promise<void> => {
    const input = ctx.settings.input?.trim();
    const text = ctx.settings.text;

    if (!input || text === undefined) {
      console.warn("Set Text Source ran with no Input/text configured");
      return;
    }

    const obs = resolveObs(this.connections, ctx.settings);

    if (!obs) {
      console.warn("Set Text Source ran with no matching Connection configured");
      return;
    }

    try {
      await setInputText(obs, input, text);
    } catch (error) {
      console.warn(`Set Text Source could not update "${input}":`, error);
    }
  };
}

import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { SetBrowserSourceUrlSettings } from "obs-protocol";

import type { ConnectionsService } from "../connections/service";
import { resolveObs } from "../connections/resolve";
import { setInputUrl } from "../obs/inputs";

export const SET_BROWSER_SOURCE_URL_ACTION = "set-browser-source-url";

export class SetBrowserSourceUrlAction extends StandaloneAction<SetBrowserSourceUrlSettings> {
  type = SET_BROWSER_SOURCE_URL_ACTION;

  constructor(private readonly connections: ConnectionsService) {
    super();
  }

  onTrigger = async (
    ctx: StandaloneTriggerContext<SetBrowserSourceUrlSettings>,
  ): Promise<void> => {
    const input = ctx.settings.input?.trim();
    const url = ctx.settings.url?.trim();

    if (!input || !url) {
      console.warn("Set Browser Source URL ran with no Input/URL configured");
      return;
    }

    const obs = resolveObs(this.connections, ctx.settings);

    if (!obs) {
      console.warn("Set Browser Source URL ran with no matching Connection configured");
      return;
    }

    try {
      await setInputUrl(obs, input, url);
    } catch (error) {
      console.warn(`Set Browser Source URL could not update "${input}":`, error);
    }
  };
}

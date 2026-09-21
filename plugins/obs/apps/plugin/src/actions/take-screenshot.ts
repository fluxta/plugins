import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { TakeScreenshotSettings } from "obs-protocol";

import type { ConnectionsService } from "../connections/service";
import { resolveObs } from "../connections/resolve";
import { formatFromPath, saveScreenshot } from "../obs/screenshot";

export const TAKE_SCREENSHOT_ACTION = "take-screenshot";

/**
 * Saves a Source's current frame to disk. `path` is passed straight through
 * to OBS as a full file path (filename and extension included) — a repeat
 * trigger with the same path overwrites the previous screenshot, same as
 * OBS's own request behaves. The image format is derived from that same
 * extension (see `formatFromPath`) rather than a separate setting, so the
 * saved bytes can never disagree with the name on the file.
 */
export class TakeScreenshotAction extends StandaloneAction<TakeScreenshotSettings> {
  type = TAKE_SCREENSHOT_ACTION;

  constructor(private readonly connections: ConnectionsService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<TakeScreenshotSettings>): Promise<void> => {
    const source = ctx.settings.source?.trim();
    const path = ctx.settings.path?.trim();

    if (!source || !path) {
      console.warn("Take Screenshot ran with no Source/path configured");
      return;
    }

    const format = formatFromPath(path);

    if (!format) {
      console.warn(
        `Take Screenshot ran with an unsupported file extension in "${path}" — use .png, .jpg, or .bmp`,
      );
      return;
    }

    const obs = resolveObs(this.connections, ctx.settings);

    if (!obs) {
      console.warn("Take Screenshot ran with no matching Connection configured");
      return;
    }

    try {
      await saveScreenshot(obs, source, format, path);
    } catch (error) {
      console.warn(`Take Screenshot could not save "${source}" to "${path}":`, error);
    }
  };
}

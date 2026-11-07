import {
  numericValue,
  parseTarget,
  type ActionResult,
  type VolumeSettings,
} from "wave-link-protocol";
import type { WaveLinkService } from "../wave-link/service";

export async function runVolume(
  service: WaveLinkService,
  settings: VolumeSettings,
  relative: boolean,
): Promise<ActionResult> {
  try {
    let target;
    try {
      target = parseTarget(settings);
    } catch {
      throw new Error(
        "Choose a Target and its Channel or Mix in this Action's settings.",
      );
    }
    return await service.setVolume(
      target,
      numericValue(settings.volumePercent),
      relative,
    );
  } catch (error) {
    return service.failure(error);
  }
}

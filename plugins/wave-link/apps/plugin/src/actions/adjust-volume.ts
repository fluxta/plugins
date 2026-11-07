import {
  StandaloneAction,
  type StandaloneTriggerContext,
} from "@fluxta/sdk/api";
import type { VolumeSettings } from "wave-link-protocol";
import type { WaveLinkService } from "../wave-link/service";
import { runVolume } from "./volume-action";

export class AdjustVolumeAction extends StandaloneAction<VolumeSettings> {
  readonly type = "adjust-volume";
  constructor(private readonly service: WaveLinkService) {
    super();
  }
  onTrigger = (ctx: StandaloneTriggerContext<VolumeSettings>) =>
    runVolume(this.service, ctx.settings, true);
}

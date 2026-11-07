import {
  StandaloneAction,
  type StandaloneTriggerContext,
} from "@fluxta/sdk/api";
import { parseTarget, type MuteSettings } from "wave-link-protocol";
import type { WaveLinkService } from "../wave-link/service";

export class SetMuteAction extends StandaloneAction<MuteSettings> {
  readonly type = "set-mute";
  constructor(private readonly service: WaveLinkService) {
    super();
  }
  onTrigger = async (ctx: StandaloneTriggerContext<MuteSettings>) => {
    try {
      let target;
      try {
        target = parseTarget(ctx.settings);
      } catch {
        throw new Error(
          "Choose a Target and its Channel or Mix in this Action's settings.",
        );
      }
      const mode = ctx.settings.mode;
      if (mode !== "mute" && mode !== "unmute" && mode !== "toggle")
        throw new Error("Choose Mute, Unmute or Toggle.");
      return await this.service.setMute(target, mode);
    } catch (error) {
      return this.service.failure(error);
    }
  };
}

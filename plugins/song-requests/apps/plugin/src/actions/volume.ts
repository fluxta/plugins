import {
  StandaloneAction,
  type StandaloneTriggerContext,
} from "@fluxta/sdk/api";
import type { VolumeSettings } from "song-requests-protocol";

import type { SongQueue } from "../songs/song-queue";
import { templatedText } from "./templated";

export const VOLUME_ACTION = "volume";

export class VolumeAction extends StandaloneAction<VolumeSettings> {
  readonly type = VOLUME_ACTION;
  constructor(private readonly queue: SongQueue) {
    super();
  }

  onTrigger = ({ settings }: StandaloneTriggerContext<VolumeSettings>) => {
    const text = templatedText(settings?.amount)?.trim();
    const amount = text ? Number(text) : NaN;
    const mode = settings?.mode ?? "set";
    if (Number.isFinite(amount) && (mode === "set" || mode === "change")) {
      this.queue.setVolume(
        mode === "change" ? this.queue.volume + amount : amount,
      );
    }
    return { volume: this.queue.volume };
  };
}

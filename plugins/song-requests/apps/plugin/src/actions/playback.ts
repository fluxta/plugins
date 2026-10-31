import {
  StandaloneAction,
  type StandaloneTriggerContext,
} from "@fluxta/sdk/api";
import type { PlaybackSettings } from "song-requests-protocol";

import type { SongQueue } from "../songs/song-queue";

export const PLAYBACK_ACTION = "playback";

export class PlaybackAction extends StandaloneAction<PlaybackSettings> {
  readonly type = PLAYBACK_ACTION;
  constructor(private readonly queue: SongQueue) {
    super();
  }

  onTrigger = ({ settings }: StandaloneTriggerContext<PlaybackSettings>) => ({
    isPaused: this.queue.playback(settings?.mode ?? "toggle"),
  });
}

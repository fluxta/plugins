import {
  StandaloneAction,
  type StandaloneTriggerContext,
} from "@fluxta/sdk/api";
import type { SkipSettings } from "song-requests-protocol";

import type { SongQueue } from "../songs/song-queue";

export const SKIP_ACTION = "skip";

export class SkipAction extends StandaloneAction<SkipSettings> {
  readonly type = SKIP_ACTION;
  constructor(private readonly queue: SongQueue) {
    super();
  }

  onTrigger = (
    context: StandaloneTriggerContext<SkipSettings>,
  ): Record<string, string> => {
    void context;
    const song = this.queue.skip();
    return song ? { title: song.title } : {};
  };
}

import {
  StandaloneAction,
  type StandaloneTriggerContext,
} from "@fluxta/sdk/api";
import type { ClearQueueSettings } from "song-requests-protocol";

import type { SongQueue } from "../songs/song-queue";

export const CLEAR_QUEUE_ACTION = "clear-queue";

export class ClearQueueAction extends StandaloneAction<ClearQueueSettings> {
  readonly type = CLEAR_QUEUE_ACTION;
  constructor(private readonly queue: SongQueue) {
    super();
  }

  onTrigger = (context: StandaloneTriggerContext<ClearQueueSettings>) => {
    void context;
    return { removed: this.queue.clear() };
  };
}

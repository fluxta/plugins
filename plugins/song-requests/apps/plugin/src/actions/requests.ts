import {
  StandaloneAction,
  type StandaloneTriggerContext,
} from "@fluxta/sdk/api";
import type { RequestsSettings } from "song-requests-protocol";

import type { SongQueue } from "../songs/song-queue";

export const REQUESTS_ACTION = "requests";

export class RequestsAction extends StandaloneAction<RequestsSettings> {
  readonly type = REQUESTS_ACTION;
  constructor(private readonly queue: SongQueue) {
    super();
  }

  onTrigger = ({ settings }: StandaloneTriggerContext<RequestsSettings>) => ({
    isOpen: this.queue.requests(settings?.mode ?? "toggle"),
  });
}

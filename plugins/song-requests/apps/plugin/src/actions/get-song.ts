import {
  StandaloneAction,
  type StandaloneTriggerContext,
} from "@fluxta/sdk/api";
import type { GetSongSettings } from "song-requests-protocol";

import { toSongPayload } from "../events";
import type { GetSongTarget, SongQueue } from "../songs/song-queue";
import { templatedText } from "./templated";

export const GET_SONG_ACTION = "get-song";

export class GetSongAction extends StandaloneAction<GetSongSettings> {
  readonly type = GET_SONG_ACTION;
  constructor(private readonly queue: SongQueue) {
    super();
  }

  onTrigger = ({
    settings,
  }: StandaloneTriggerContext<GetSongSettings>): Record<
    string,
    string | number
  > => {
    let target: GetSongTarget;
    switch (settings?.target ?? "current") {
      case "current":
        target = { kind: "current" };
        break;
      case "position":
        target = {
          kind: "position",
          position: Number(templatedText(settings?.position)),
        };
        break;
      case "requesterNext":
        target = {
          kind: "requesterNext",
          requesterPlatform: templatedText(settings?.requesterPlatform) ?? "",
          requesterId: templatedText(settings?.requesterId) ?? "",
        };
        break;
      default:
        return {};
    }
    const found = this.queue.getSong(target);
    if (!found) return {};
    return {
      ...toSongPayload(found.song),
      position: found.position,
      ...(found.eta === undefined ? {} : { eta: found.eta }),
    };
  };
}

import {
  StandaloneAction,
  type StandaloneTriggerContext,
} from "@fluxta/sdk/api";
import type { RemoveSongSettings } from "song-requests-protocol";

import type { RemoveSongTarget, SongQueue } from "../songs/song-queue";
import { templatedText } from "./templated";

export const REMOVE_SONG_ACTION = "remove-song";

export class RemoveSongAction extends StandaloneAction<RemoveSongSettings> {
  readonly type = REMOVE_SONG_ACTION;
  constructor(private readonly queue: SongQueue) {
    super();
  }

  onTrigger = ({ settings }: StandaloneTriggerContext<RemoveSongSettings>) => {
    let target: RemoveSongTarget;
    const kind = settings?.target ?? "requesterLatest";
    switch (kind) {
      case "requesterLatest":
      case "requesterAll":
        target = {
          kind,
          requesterPlatform: templatedText(settings?.requesterPlatform) ?? "",
          requesterId: templatedText(settings?.requesterId) ?? "",
        };
        break;
      case "position":
        target = {
          kind: "position",
          position: Number(templatedText(settings?.position)),
        };
        break;
      case "songId":
        target = {
          kind: "songId",
          songId: templatedText(settings?.songId) ?? "",
        };
        break;
      default:
        return { removed: 0 };
    }
    const songs = this.queue.remove(target);
    return {
      removed: songs.length,
      ...(songs[0] ? { title: songs[0].title } : {}),
    };
  };
}

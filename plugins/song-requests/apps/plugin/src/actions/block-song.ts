import {
  StandaloneAction,
  type StandaloneTriggerContext,
} from "@fluxta/sdk/api";
import type { BlockSongSettings } from "song-requests-protocol";

import type { SongQueue } from "../songs/song-queue";
import { templatedText } from "./templated";

export const BLOCK_SONG_ACTION = "block-song";

export class BlockSongAction extends StandaloneAction<BlockSongSettings> {
  readonly type = BLOCK_SONG_ACTION;
  constructor(private readonly queue: SongQueue) {
    super();
  }

  onTrigger = ({
    settings,
  }: StandaloneTriggerContext<BlockSongSettings>): Record<string, string> => {
    const target = settings?.target ?? "current";
    const kind = settings?.kind ?? "track";
    if (
      (target !== "current" && target !== "songId") ||
      (kind !== "track" && kind !== "channel")
    )
      return {};
    const song = this.queue.blockSong(
      target === "current"
        ? { kind: "current" }
        : { kind: "songId", songId: templatedText(settings?.songId) ?? "" },
      kind,
    );
    return song ? { title: song.title } : {};
  };
}

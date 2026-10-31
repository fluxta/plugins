import type { Song, SongDroppedReason } from "./songs/provider";

export const SONG_STARTED_EVENT = "song-started";
export const SONG_ENDED_EVENT = "song-ended";
export const SONG_DROPPED_EVENT = "song-dropped";

/** The Song, its Requester and its Reference, as every Song Event declares them. */
export type SongPayload = {
  songId: string;
  provider: string;
  title: string;
  channel: string;
  /** Left out while a Song's duration is not known. */
  duration?: number;
  url: string;
  requesterPlatform: string;
  requesterId: string;
  requesterName: string;
  reference: string;
};

export type SongEndedPayload = SongPayload & {
  how: "finished" | "failed" | "skipped";
};

export type SongDroppedPayload = SongPayload & {
  why: SongDroppedReason;
};

export function toSongPayload(song: Song): SongPayload {
  return {
    songId: song.id,
    provider: song.provider,
    title: song.title,
    channel: song.channel,
    ...(song.duration === undefined ? {} : { duration: song.duration }),
    url: song.url,
    requesterPlatform: song.requesterPlatform,
    requesterId: song.requesterId,
    requesterName: song.requesterName,
    reference: song.reference,
  };
}

export function toSongStartedPayload(song: Song): SongPayload {
  return toSongPayload(song);
}

export function toSongEndedPayload(
  song: Song,
  how: SongEndedPayload["how"],
): SongEndedPayload {
  return { ...toSongPayload(song), how };
}

export function toSongDroppedPayload(
  song: Song,
  why: SongDroppedPayload["why"],
): SongDroppedPayload {
  return { ...toSongPayload(song), why };
}

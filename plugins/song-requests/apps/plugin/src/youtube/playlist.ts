import type { Track } from "../songs/provider";
import type { DataApi } from "./data-api";
import { watchUrl } from "./link";
import { resolveVideo } from "./playability";

/** `videos.list` takes at most 50 ids a call; a playlist is learned 50 at a time. */
const VIDEOS_PER_CALL = 50;

/** Learns the Fallback Playlist with the API Key, or from its Player without one. */
export async function fallbackPlaylistTracks(
  dataApi: DataApi,
  playlistId: string,
  region: string,
  listPlaylist: (playlistId: string) => Promise<string[]>,
): Promise<Track[]> {
  if (!dataApi.unusable()) {
    const tracks = await playlistTracks(dataApi, playlistId, region);
    // A refused key or spent quota can first be discovered by this reading
    // itself. In either case the Player can still list it (ADR-0005).
    if (!dataApi.unusable()) return tracks;
  }
  return keylessPlaylistTracks(await listPlaylist(playlistId));
}

/**
 * The Fallback Playlist's tracks, read through the Data API: one unit per
 * 50 entries of `playlistItems.list`, then one per 50 of `videos.list`,
 * which also leaves out what cannot play (ADR-0003, ADR-0005). On any
 * trouble — no usable key, YouTube not answering — an empty list: the
 * playlist is learned again when it is read anew.
 */
export async function playlistTracks(
  dataApi: DataApi,
  playlistId: string,
  region: string,
): Promise<Track[]> {
  const items = await dataApi.playlistItems(playlistId);
  if (items.kind !== "ids") return [];

  const tracks: Track[] = [];
  for (let at = 0; at < items.ids.length; at += VIDEOS_PER_CALL) {
    const batch = items.ids.slice(at, at + VIDEOS_PER_CALL);
    const answer = await dataApi.videos(batch);
    if (answer.kind !== "videos") return [];
    for (const id of batch) {
      const resolution = resolveVideo(
        id,
        answer.videos.find((video) => video.id === id),
        region,
      );
      if (resolution.kind === "track") tracks.push(resolution.track);
    }
  }
  return tracks;
}

/**
 * Fallback Tracks from the ids the Player Page listed without the API Key:
 * nothing but the video id is known — the title comes from the player when
 * the track loads, and what cannot play is skipped at load (ADR-0005).
 */
export function keylessPlaylistTracks(ids: string[]): Track[] {
  return ids.map((id) => ({
    provider: "youtube",
    trackId: id,
    title: "",
    channel: "",
    channelUrl: "",
    url: watchUrl(id),
  }));
}

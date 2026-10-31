import type { RefusalReason, Resolution } from "../songs/provider";
import type { Video } from "./data-api";
import { watchUrl } from "./link";

/** ISO 8601 as the Data API writes a duration: `PT3M33S`, `P1DT2H`, `P0D`. */
const ISO_DURATION =
  /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

/** A duration in seconds, or `undefined` when it cannot be read. */
function secondsOf(duration = ""): number | undefined {
  const match = ISO_DURATION.exec(duration);
  // Every part is optional, so a bare `P` or `PT` would read as no time at all.
  if (!match || !/\d/.test(duration)) return undefined;
  const [weeks, days, hours, minutes, seconds] = match
    .slice(1)
    .map((part) => Number(part ?? 0));
  return (((weeks * 7 + days) * 24 + hours) * 60 + minutes) * 60 + seconds;
}

/**
 * Whether the video can be shown in the Region: `allowed`, when present,
 * lists the only places it plays — an empty list, none — and `blocked` the
 * places it does not.
 */
function blockedIn(video: Video, region: string): boolean {
  const restriction = video.contentDetails?.regionRestriction;
  if (restriction?.allowed) return !restriction.allowed.includes(region);
  return restriction?.blocked?.includes(region) ?? false;
}

/**
 * Why a video cannot play here, by the fields spike #3 confirmed — or
 * `undefined` when it can. Playability is never overridden.
 */
function refusalOf(video: Video, region: string): RefusalReason | undefined {
  if (video.status?.privacyStatus === "private") return "not-found";
  if (video.status?.embeddable === false) return "not-embeddable";
  if (video.contentDetails?.contentRating?.ytRating === "ytAgeRestricted") {
    return "age-restricted";
  }
  if (blockedIn(video, region)) return "region-blocked";
  // `upcoming` is a premiere or a live stream yet to start; neither plays as
  // a Song with an end.
  const live = video.snippet?.liveBroadcastContent ?? "none";
  if (live !== "none") return "live";
  return undefined;
}

/** A video `videos.list` gave for `id` — or did not — as a track or a Refusal. */
export function resolveVideo(
  id: string,
  video: Video | undefined,
  region: string,
): Resolution {
  // A private video is left out of `videos.list` for an API Key, as a
  // missing one is.
  if (!video) return { kind: "refused", reason: "not-found" };

  const reason = refusalOf(video, region);
  if (reason) return { kind: "refused", reason };

  const { snippet, contentDetails } = video;
  return {
    kind: "track",
    track: {
      provider: "youtube",
      trackId: id,
      title: snippet?.title ?? "",
      channel: snippet?.channelTitle ?? "",
      ...(snippet?.channelId ? { channelId: snippet.channelId } : {}),
      channelUrl: snippet?.channelId
        ? `https://www.youtube.com/channel/${snippet.channelId}`
        : "",
      url: watchUrl(id),
      duration: secondsOf(contentDetails?.duration),
      // Music only reads YouTube's category, so it is checked only where
      // the Data API told it — never on an oEmbed track (ADR-0005).
      ...(snippet?.categoryId !== undefined
        ? { music: snippet.categoryId === "10" }
        : {}),
    },
  };
}

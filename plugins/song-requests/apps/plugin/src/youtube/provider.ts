import type {
  Player,
  Provider,
  RefusalReason,
  Resolution,
  ResolveOptions,
} from "../songs/provider";
import type { DataApi } from "./data-api";
import type { Fetch } from "./fetch";
import { videoIdOf } from "./link";
import { checkWithOEmbed } from "./oembed";
import { resolveVideo } from "./playability";
import { SearchCache, searchWords } from "./search-cache";

/**
 * YouTube (ADR-0005). With a usable API Key a link is checked through
 * `videos.list` — Playability and duration — before the Request is answered,
 * so an accepted one will play. Without one — none set, a key YouTube
 * refuses, its units spent — or while the Data API does not answer, a link
 * is checked through oEmbed and what only the player can tell waits for the
 * Song's Start Check.
 */
export function createYouTubeProvider({
  fetch,
  player,
  dataApi,
  region,
  searchCache = new SearchCache(),
}: {
  fetch: Fetch;
  player: Player;
  dataApi: DataApi;
  /** The Region Playability is checked for, as it stands now. */
  region: () => string;
  searchCache?: SearchCache;
}): Provider {
  async function search(
    request: string,
    options?: ResolveOptions,
  ): Promise<Resolution> {
    // A cached id still needs videos.list: no keyless Start Check for words.
    const unusable = dataApi.unusable();
    if (unusable) return { kind: "refused", reason: unusable };
    const words = searchWords(request);
    if (!words) return { kind: "refused", reason: "not-found" };
    const cached = searchCache.get(words);
    const searchRegion = region();
    let ids: string[];
    if (cached) {
      ids = [cached];
    } else {
      const answer = await dataApi.search(
        words,
        searchRegion,
        options?.musicOnly ?? false,
      );
      if (answer.kind !== "ids") {
        return {
          kind: "refused",
          reason:
            answer.kind === "unusable" ? answer.reason : "provider-unavailable",
        };
      }
      ids = answer.ids;
    }
    if (!ids.length) return { kind: "refused", reason: "not-found" };

    const answer = await dataApi.videos(ids);
    if (answer.kind !== "videos") {
      return {
        kind: "refused",
        reason:
          answer.kind === "unusable" ? answer.reason : "provider-unavailable",
      };
    }
    let firstReason: RefusalReason | undefined;
    // videos.list may reorder or omit ids; relevance is the search's order.
    for (const id of ids) {
      const resolution = resolveVideo(
        id,
        answer.videos.find((video) => video.id === id),
        searchRegion,
      );
      const reason =
        resolution.kind === "refused"
          ? resolution.reason
          : options?.refusalOf(resolution.track);
      if (reason) {
        firstReason ??= reason;
        continue;
      }
      if (!cached) searchCache.set(words, id);
      return resolution;
    }
    return { kind: "refused", reason: firstReason ?? "not-found" };
  }

  return {
    id: "youtube",
    player,
    claims: (request) => videoIdOf(request) !== undefined,

    async resolve(request, options): Promise<Resolution> {
      const id = videoIdOf(request);

      if (!id) return search(request, options);

      const answer = await dataApi.videos([id]);

      if (answer.kind === "videos") {
        return resolveVideo(
          id,
          answer.videos.find((video) => video.id === id),
          region(),
        );
      }

      return checkWithOEmbed(fetch, id);
    },
  };
}

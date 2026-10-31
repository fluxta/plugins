import type { RefusalReason, Resolution } from "../songs/provider";
import type { Fetch } from "./fetch";
import { watchUrl } from "./link";

/**
 * Fluxta waits about 30 s for an Action to answer, and a link may first have
 * waited for the Data API: oEmbed gets well under half of it.
 */
const OEMBED_TIMEOUT_MS = 10_000;

type OEmbed = { title?: unknown; author_name?: unknown; author_url?: unknown };

/**
 * What oEmbed's refusals mean (spike #3): 400 for a missing video, 401 for
 * one that may not be embedded. Anything else is YouTube not answering.
 */
function refusalFor(status: number): RefusalReason {
  if (status === 400 || status === 404) return "not-found";
  if (status === 401 || status === 403) return "not-embeddable";
  return "provider-unavailable";
}

/**
 * A video checked through oEmbed, which needs no key: it knows a missing and
 * a non-embeddable video, but neither duration, age restriction, Region nor
 * a live stream — those wait for the Song's Start Check (ADR-0005).
 */
export async function checkWithOEmbed(
  fetch: Fetch,
  id: string,
): Promise<Resolution> {
  const url = new URL("https://www.youtube.com/oembed");
  url.searchParams.set("format", "json");
  url.searchParams.set("url", watchUrl(id));

  let body: OEmbed;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS),
    });

    if (!response.ok) {
      return { kind: "refused", reason: refusalFor(response.status) };
    }

    body = (await response.json()) as OEmbed;
  } catch {
    return { kind: "refused", reason: "provider-unavailable" };
  }

  return {
    kind: "track",
    track: {
      provider: "youtube",
      trackId: id,
      title: typeof body.title === "string" ? body.title : "",
      channel: typeof body.author_name === "string" ? body.author_name : "",
      channelUrl: typeof body.author_url === "string" ? body.author_url : "",
      url: watchUrl(id),
    },
  };
}

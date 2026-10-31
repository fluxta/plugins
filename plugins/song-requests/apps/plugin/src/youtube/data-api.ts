import type { ApiKeyStatus } from "song-requests-protocol";

import type { RefusalReason } from "../songs/provider";
import type { Fetch } from "./fetch";
import { nextQuotaReset } from "./quota-reset";

const DATA_API = "https://www.googleapis.com/youtube/v3";

/**
 * Fluxta waits about 30 s for an Action to answer. A search needs two calls;
 * a link the Data API cannot answer goes on to oEmbed. Each gets 10 s.
 */
const DATA_API_TIMEOUT_MS = 10_000;

/**
 * The part of a `videos.list` item (`snippet,contentDetails,status`) the
 * plugin reads — the fields spike #3 confirmed on real examples.
 */
export type Video = {
  id: string;
  snippet?: {
    title?: string;
    channelId?: string;
    channelTitle?: string;
    /** YouTube's category; `10` is Music, what Music only checks. */
    categoryId?: string;
    /** `none`, or `live` / `upcoming` for a live stream or a premiere. */
    liveBroadcastContent?: string;
  };
  contentDetails?: {
    /** ISO 8601, `PT3M33S`; `P0D` for a live stream. */
    duration?: string;
    contentRating?: { ytRating?: string };
    regionRestriction?: { allowed?: string[]; blocked?: string[] };
  };
  status?: { embeddable?: boolean; privacyStatus?: string };
};

/** Why the API Key cannot be used now — the Refusal of a Request that needs it. */
export type UnusableKey = Extract<
  RefusalReason,
  "no-api-key" | "api-key-invalid" | "quota-exhausted"
>;

export type VideosAnswer =
  | { kind: "videos"; videos: Video[] }
  | { kind: "unusable"; reason: UnusableKey }
  /** YouTube did not answer, or not in a way that says anything of the key. */
  | { kind: "unavailable" };

export type SearchAnswer =
  { kind: "ids"; ids: string[] } | Exclude<VideosAnswer, { kind: "videos" }>;

/** `playlistItems.list` answers the ids it holds, paged 50 to a unit. */
export type PlaylistItemsAnswer =
  { kind: "ids"; ids: string[] } | Exclude<VideosAnswer, { kind: "videos" }>;

/**
 * Any video answers a check of the key: one gone since still comes back as
 * an empty list, which says the key works as well as a found one would.
 */
const CHECK_VIDEO = "dQw4w9WgXcQ";

/**
 * YouTube's Data API with the streamer's API Key (ADR-0005). It follows what
 * YouTube says of the key — refused until the key is saved again, its daily
 * units spent until midnight Pacific — and while the key cannot be used it
 * asks YouTube nothing and says why.
 */
export class DataApi {
  readonly #fetch: Fetch;
  #key = "";
  /** What YouTube last said of the key. */
  #verdict: "none" | "accepted" | "refused" = "none";
  /** Until when, by `Date.now()`, YouTube says the key's daily units are spent. */
  #spentUntil = 0;
  /** Search Queries has its own daily bucket; it cannot starve link checks. */
  #searchSpentUntil = 0;
  #resetTimer?: ReturnType<typeof setTimeout>;
  readonly #listeners: (() => void)[] = [];

  constructor({ fetch }: { fetch: Fetch }) {
    this.#fetch = fetch;
  }

  /**
   * The key as saved in Plugin settings, `""` for none. Saving starts afresh,
   * even with the same key: what YouTube said of it may no longer hold — its
   * project has the Data API enabled since, say.
   */
  setKey(key: string): void {
    this.#key = key.trim();
    this.#verdict = "none";
    this.#spentUntil = 0;
    this.#searchSpentUntil = 0;
    clearTimeout(this.#resetTimer);
    this.#notify();
  }

  /** Why the key cannot be used now, or `undefined` when it can. */
  unusable(): UnusableKey | undefined {
    if (!this.#key) return "no-api-key";
    if (this.#verdict === "refused") return "api-key-invalid";
    if (Date.now() < this.#spentUntil) return "quota-exhausted";
    return undefined;
  }

  /** What the Plugin Editor shows of the key: why it cannot be used, or what YouTube said of it. */
  status(): ApiKeyStatus {
    const masked = `••••${this.#key.slice(-4)}`;

    switch (this.unusable()) {
      case "no-api-key":
        return { state: "none", masked: "" };
      case "api-key-invalid":
        return { state: "refused", masked };
      case "quota-exhausted":
        return { state: "spent", masked, resetsAt: this.#spentUntil };
      case undefined:
        return {
          state: this.#verdict === "accepted" ? "accepted" : "unchecked",
          masked,
        };
    }
  }

  /** Called whenever `status()` changes. */
  onStatusChange(listener: () => void): void {
    this.#listeners.push(listener);
  }

  /**
   * Asks YouTube whether it accepts a key it has not answered about yet, so
   * the Plugin Editor can say so before any Request — one unit.
   */
  async check(): Promise<void> {
    if (this.#verdict !== "none" || this.unusable()) return;
    await this.#list("id", [CHECK_VIDEO]);
  }

  /** `videos.list` for the ids, one unit whatever their number (up to 50). */
  videos(ids: string[]): Promise<VideosAnswer> {
    return this.#list("snippet,contentDetails,status", ids);
  }

  /**
   * `playlistItems.list` for the playlist — one unit per 50 entries, in the
   * daily-units bucket like `videos.list`, paged through `nextPageToken`.
   * Entries YouTube gives no video id for (a deleted or private video) are
   * left out; what else cannot play is left out by `videos()`.
   */
  async playlistItems(playlistId: string): Promise<PlaylistItemsAnswer> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL(`${DATA_API}/playlistItems`);
      url.searchParams.set("part", "contentDetails");
      url.searchParams.set("playlistId", playlistId);
      url.searchParams.set("maxResults", "50");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const answer = await this.#request<PlaylistItem>(url, "videos");
      if (answer.kind !== "items") return answer;
      ids.push(
        ...answer.items.flatMap((item) =>
          typeof item?.contentDetails?.videoId === "string" &&
          item.contentDetails.videoId
            ? [item.contentDetails.videoId]
            : [],
        ),
      );
      pageToken = answer.nextPageToken;
    } while (pageToken);
    return { kind: "ids", ids };
  }

  async search(
    words: string,
    region: string,
    musicOnly: boolean,
  ): Promise<SearchAnswer> {
    const reason = this.unusable();
    if (reason) return { kind: "unusable", reason };
    if (Date.now() < this.#searchSpentUntil) {
      return { kind: "unusable", reason: "quota-exhausted" };
    }
    const url = new URL(`${DATA_API}/search`);
    url.search = new URLSearchParams({
      part: "snippet",
      q: words,
      type: "video",
      videoEmbeddable: "true",
      videoSyndicated: "true",
      regionCode: region,
      maxResults: "5",
      ...(musicOnly ? { videoCategoryId: "10" } : {}),
    }).toString();
    const answer = await this.#request<SearchItem>(url, "search");
    if (answer.kind !== "items") return answer;
    const ids = answer.items
      .flatMap((item) =>
        typeof item?.id?.videoId === "string" && item.id.videoId
          ? [item.id.videoId]
          : [],
      )
      .slice(0, 5);
    return { kind: "ids", ids };
  }

  async #list(part: string, ids: string[]): Promise<VideosAnswer> {
    const url = new URL(`${DATA_API}/videos`);
    url.searchParams.set("part", part);
    url.searchParams.set("id", ids.join(","));
    const answer = await this.#request<Video>(url, "videos");
    return answer.kind === "items"
      ? { kind: "videos", videos: answer.items }
      : answer;
  }

  async #request<T>(
    url: URL,
    bucket: "search" | "videos",
  ): Promise<
    | {
        kind: "items";
        items: T[];
        /** `playlistItems.list` pages through it; absent on its last page. */
        nextPageToken?: string;
      }
    | Exclude<VideosAnswer, { kind: "videos" }>
  > {
    const reason = this.unusable();
    if (reason) return { kind: "unusable", reason };

    const key = this.#key;
    let response: Response;
    let body: ApiBody<T> | null;

    try {
      // In a header rather than the address, so the key is in no URL
      // anything might print.
      response = await this.#fetch(url, {
        headers: { "x-goog-api-key": key },
        signal: AbortSignal.timeout(DATA_API_TIMEOUT_MS),
      });
      body = (await response.json()) as ApiBody<T> | null;
    } catch {
      return { kind: "unavailable" };
    }

    // The key was changed while YouTube answered: what it said was of the
    // old one, and only this Request's answer.
    const current = key === this.#key;

    if (keyRefused(response.status, body)) {
      if (current) this.#hear("refused");
      return { kind: "unusable", reason: "api-key-invalid" };
    }
    if (unitsSpent(response.status, body)) {
      if (current) {
        if (bucket === "search") {
          this.#searchSpentUntil = nextQuotaReset(Date.now());
          this.#hear("accepted");
        } else {
          this.#spend();
        }
      }
      return { kind: "unusable", reason: "quota-exhausted" };
    }
    if (!response.ok || !Array.isArray(body?.items)) {
      return { kind: "unavailable" };
    }

    if (current) this.#hear("accepted");
    return {
      kind: "items",
      items: body.items,
      ...(typeof body.nextPageToken === "string"
        ? { nextPageToken: body.nextPageToken }
        : {}),
    };
  }

  #hear(verdict: "accepted" | "refused"): void {
    if (this.#verdict === verdict) return;
    this.#verdict = verdict;
    this.#notify();
  }

  /**
   * YouTube resets the units at midnight Pacific; the plugin keeps no count
   * of its own (ADR-0005), so it waits for that and asks again. A key whose
   * units were counted is one YouTube accepts.
   */
  #spend(): void {
    this.#verdict = "accepted";
    this.#spentUntil = nextQuotaReset(Date.now());
    clearTimeout(this.#resetTimer);
    this.#resetTimer = setTimeout(
      () => this.#notify(),
      this.#spentUntil - Date.now(),
    );
    this.#notify();
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }
}

type SearchItem = { id?: { videoId?: string } };

type PlaylistItem = { contentDetails?: { videoId?: string } };

type ApiBody<T = unknown> = {
  items?: T[];
  nextPageToken?: string;
  error?: {
    message?: string;
    errors?: { reason?: string }[];
    details?: { reason?: string }[];
  };
};

/**
 * A key YouTube will not take until the streamer does something about it. A
 * key that is not valid is HTTP 400 `badRequest`, "API key not valid" — not
 * 403 `keyInvalid`, as older pages of YouTube's say (spike #3). A valid key
 * is refused with 403 when its project has not enabled the YouTube Data API
 * v3 (`accessNotConfigured`) or when it is restricted to websites or apps,
 * which the sidecar is not (`API_KEY_…_BLOCKED`).
 */
function keyRefused(status: number, body: ApiBody | null): boolean {
  const error = body?.error;
  const reasons = [
    ...(error?.errors ?? []).map((entry) => entry.reason),
    ...(error?.details ?? []).map((entry) => entry.reason),
  ];

  if (status === 400) {
    return (
      reasons.includes("API_KEY_INVALID") ||
      /API key not valid/.test(error?.message ?? "")
    );
  }
  return (
    status === 403 &&
    reasons.some(
      (reason) =>
        reason === "accessNotConfigured" ||
        /^API_KEY_\w+_BLOCKED$/.test(reason ?? ""),
    )
  );
}

/**
 * YouTube's 403 `quotaExceeded` applies to the called method's bucket:
 * Search Queries for search.list, daily units for videos.list (ADR-0005).
 */
function unitsSpent(status: number, body: ApiBody | null): boolean {
  return (
    status === 403 &&
    (body?.error?.errors?.some((error) => error.reason === "quotaExceeded") ??
      false)
  );
}

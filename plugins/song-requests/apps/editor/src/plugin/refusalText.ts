import type { RefusalReason } from "song-requests-protocol";

/**
 * A Refusal's reason the way the Plugin Editor says it — the raw reason is
 * what a run's Run Variables carry for a chat reply; here it is a sentence.
 */
const REFUSAL_TEXT: Record<RefusalReason, string> = {
  "not-found": "not found on YouTube",
  "not-embeddable": "cannot be played in an embedded player",
  "age-restricted": "age-restricted",
  "region-blocked": "blocked in the chosen Region",
  live: "a live stream",
  "no-api-key": "search words need the API Key",
  "api-key-invalid": "the API Key is refused",
  "quota-exhausted": "YouTube's daily quota is spent",
  "provider-unavailable": "YouTube did not answer",
  closed: "Requests are closed",
  "too-long": "longer than the Longest Duration",
  "too-short": "shorter than the Shortest Duration",
  "requester-limit":
    "this Requester already has the most Songs waiting allowed",
  "queue-full": "the Song Queue is full",
  "already-queued": "already in the Song Queue or on air",
  "recently-played": "played too recently",
  blocked: "in the Blocklist",
  "not-music": "not counted as music by YouTube",
};

export function refusalText(reason: RefusalReason): string {
  return REFUSAL_TEXT[reason];
}

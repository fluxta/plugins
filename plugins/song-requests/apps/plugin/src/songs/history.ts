import type { Song } from "./provider";

/**
 * The History: the Songs that left the air, newest first. It is what Played
 * within checks a Request against, and what the Plugin Editor's History
 * shows. Kept in the State file (ADR-0002); a Song reaches it only by going
 * on air first, so a dropped Song is never "played".
 */

/** At most this many Songs are kept. */
export const HISTORY_LIMIT = 200;

/** None this old, however few there are: 30 days, in ms. */
export const HISTORY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** One Song that left the air. */
export type HistoryEntry = {
  song: Song;
  /** How it left the air. */
  how: "finished" | "failed" | "skipped";
  /** When it left the air, in ms since the epoch (`Date.now()`). */
  at: number;
};

/**
 * What is left of `history` at `now`: nothing older than
 * HISTORY_MAX_AGE_MS, at most the HISTORY_LIMIT newest.
 */
export function trimHistory(
  history: HistoryEntry[],
  now = Date.now(),
): HistoryEntry[] {
  const oldest = now - HISTORY_MAX_AGE_MS;
  return history.filter((entry) => entry.at >= oldest).slice(0, HISTORY_LIMIT);
}

/** The History with `entry` first, trimmed — a new entry is always kept. */
export function recordInHistory(
  history: HistoryEntry[],
  entry: HistoryEntry,
): HistoryEntry[] {
  return trimHistory([entry, ...history], entry.at);
}

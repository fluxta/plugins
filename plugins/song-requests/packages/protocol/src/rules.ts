import { z } from "zod";

/**
 * The Rules a Request must pass to become a Song, their Defaults and a
 * step's Overrides of them. Shared by the sidecar (which applies them), the
 * Action Editor (which edits a step's Overrides) and the Plugin Editor
 * (which edits the Defaults and the Blocklist).
 */

/**
 * One Rule's value in Plugin settings. Where a Rule is missing, the sidecar
 * falls back to #1's values (FALLBACK_RULE_DEFAULTS).
 */
export type RuleDefaults = {
  /** Requests Open: whether Request Song accepts Requests at all. */
  requestsOpen: boolean;
  /** Longest duration, in seconds, a Song may be. */
  longestDurationSeconds: number;
  /** Shortest duration, in seconds; absent for none. */
  shortestDurationSeconds?: number;
  /** How many of a Requester's Songs may wait at once, by platform and id. */
  waitingPerRequester: number;
  /** How many Songs may wait in the Song Queue. */
  queueSize: number;
  /** Whether a track already waiting or on air is refused. */
  alreadyQueued: "refuse" | "allow";
  /** A track that played this many seconds ago is refused; 0 for never. */
  playedWithinSeconds: number;
  /** Music only: refuse what the Provider does not count as music. */
  musicOnly: boolean;
};

/** #1's Defaults, kept where the streamer has not set one. */
export const FALLBACK_RULE_DEFAULTS: RuleDefaults = {
  requestsOpen: true,
  longestDurationSeconds: 600,
  waitingPerRequester: 3,
  queueSize: 50,
  alreadyQueued: "refuse",
  playedWithinSeconds: 3600,
  musicOnly: false,
};

/**
 * A step's Override of one Rule: follow the Default, a value of its own, or
 * do not check. A value a Rule has no use for (the Blocklist has nothing to
 * be overridden to) is absent, and the mode is read alone.
 */
export type RuleOverride<Value> =
  { mode: "default" } | { mode: "value"; value: Value } | { mode: "off" };

/** Request Song's Overrides, one per Rule it can Override. */
export type RequestSongOverrides = {
  /** The value is whether Requests are open. */
  requestsOpen?: RuleOverride<boolean>;
  longestDurationSeconds?: RuleOverride<number>;
  shortestDurationSeconds?: RuleOverride<number>;
  waitingPerRequester?: RuleOverride<number>;
  queueSize?: RuleOverride<number>;
  alreadyQueued?: RuleOverride<"refuse" | "allow">;
  /** `off` re-checks nothing, however recently the track played. */
  playedWithinSeconds?: RuleOverride<number>;
  /** `off` lets a blocked track or channel through. */
  blocklist?: { mode: "default" } | { mode: "off" };
  /** The value is whether only music is accepted. */
  musicOnly?: RuleOverride<boolean>;
};

/**
 * One thing the streamer never wants played: a track, by its Provider and
 * the Provider's own id, or a channel, by its Provider and id when known, else its address — the address oEmbed
 * gives when there is no API Key (ADR-0005).
 */
export type BlocklistEntry =
  | { kind: "track"; provider: string; trackId: string }
  | {
      kind: "channel";
      provider?: string;
      channelId?: string;
      channelUrl: string;
    };

const RuleDefaultsSchema = z.object({
  requestsOpen: z.boolean(),
  longestDurationSeconds: z.number().nonnegative(),
  shortestDurationSeconds: z.number().nonnegative().optional(),
  waitingPerRequester: z.number().int().nonnegative(),
  queueSize: z.number().int().nonnegative(),
  alreadyQueued: z.enum(["refuse", "allow"]),
  playedWithinSeconds: z.number().nonnegative(),
  musicOnly: z.boolean(),
});

const BlocklistEntrySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("track"),
    provider: z.string(),
    trackId: z.string(),
  }),
  z.object({
    kind: z.literal("channel"),
    provider: z.string().optional(),
    channelId: z.string().optional(),
    channelUrl: z.string(),
  }),
]);

export { BlocklistEntrySchema, RuleDefaultsSchema };

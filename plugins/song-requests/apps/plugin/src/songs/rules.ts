import type {
  BlocklistEntry,
  RequestSongOverrides,
  RuleDefaults,
} from "song-requests-protocol";

import type { RefusalReason, Song, Track } from "./provider";

/**
 * The Rules (the streamer's checks of a Request) as one resolved answer for
 * one Request: each Rule is a value or not checked at all. A step's
 * Overrides win over the Defaults; "do not check" wins over both. Playability
 * is not a Rule and is never here — a track that cannot play at all is
 * refused by its Provider whatever this says.
 */
export type ResolvedRules = {
  /** `true` accepts; a closed plugin refuses as `closed`. */
  requestsOpen: boolean;
  /** Seconds; absent when the Song may be any length. */
  longestDurationSeconds?: number;
  /** Seconds; absent when the Song may be any length. */
  shortestDurationSeconds?: number;
  /** Waiting Songs per Requester; absent for no limit. */
  waitingPerRequester?: number;
  /** Waiting Songs in all; absent for no limit. */
  queueSize?: number;
  refuseAlreadyQueued: boolean;
  /** Seconds; 0 when a track may play again at once. */
  playedWithinSeconds: number;
  enforceBlocklist: boolean;
  musicOnly: boolean;
};

/** The number a step's Override resolves `rule` to, `undefined` when it does not say. */
function overrideNumber(
  override: RequestSongOverrides[keyof RequestSongOverrides] | undefined,
): number | undefined {
  if (
    override &&
    override.mode === "value" &&
    typeof override.value === "number" &&
    override.value >= 0
  ) {
    return override.value;
  }
  return undefined;
}

/** Whether `override` carries its rule's "on" value, `undefined` when it does not say. */
function overrideOn(
  override: RequestSongOverrides[keyof RequestSongOverrides] | undefined,
): boolean | undefined {
  if (!override) return undefined;
  if (override.mode === "off") return false;
  if (override.mode === "value") {
    return typeof override.value === "boolean" ? override.value : undefined;
  }
  return undefined;
}
/**
 * The Rules as they stand for one Request Song step: its Overrides over the
 * Defaults; "do not check" wins over both. An Override that does not hold a
 * usable value falls back to the Default — a setting arrives over the wire
 * and is not trusted.
 */
export function resolveRules(
  overrides: RequestSongOverrides | undefined,
  defaults: RuleDefaults,
): ResolvedRules {
  const numberRule = (
    override: RequestSongOverrides[keyof RequestSongOverrides] | undefined,
    fallback: number | undefined,
  ): number | undefined => {
    if (override?.mode === "off") return undefined;
    return overrideNumber(override) ?? fallback;
  };

  const flagRule = (fallback: boolean) => (on: boolean | undefined) =>
    on ?? fallback;

  const resolved: ResolvedRules = {
    // "Do not check" Requests Open means the step never refuses as `closed`
    // — the same as open, since that is the only way the Rule can refuse.
    requestsOpen:
      overrides?.requestsOpen?.mode === "off"
        ? true
        : flagRule(defaults.requestsOpen)(overrideOn(overrides?.requestsOpen)),
    longestDurationSeconds: numberRule(
      overrides?.longestDurationSeconds,
      defaults.longestDurationSeconds,
    ),
    shortestDurationSeconds: numberRule(
      overrides?.shortestDurationSeconds,
      defaults.shortestDurationSeconds,
    ),
    waitingPerRequester: numberRule(
      overrides?.waitingPerRequester,
      defaults.waitingPerRequester,
    ),
    queueSize: numberRule(overrides?.queueSize, defaults.queueSize),
    refuseAlreadyQueued: (() => {
      const override = overrides?.alreadyQueued;
      if (override?.mode === "off") return false;
      if (override?.mode === "value") {
        if (override.value === "allow") return false;
        if (override.value === "refuse") return true;
      }
      return defaults.alreadyQueued === "refuse";
    })(),
    playedWithinSeconds:
      numberRule(
        overrides?.playedWithinSeconds,
        defaults.playedWithinSeconds,
      ) ?? 0,
    enforceBlocklist: overrides?.blocklist?.mode !== "off",
    musicOnly: flagRule(defaults.musicOnly)(overrideOn(overrides?.musicOnly)),
  };

  return resolved;
}

export type RulesContext = {
  track: Track;
  /** Who asks; absent reads as the streamer's own Request, which no per-Requester limit counts. */
  requester?: { requesterPlatform: string; requesterId: string };
  /** What the checks count and compare against; empty where not given. */
  waiting?: readonly Song[];
  current?: Song;
  history?: readonly { song: Song; at: number }[];
  blocklist?: readonly BlocklistEntry[];
  /** ms since the epoch; `Date.now()` where the caller does not say. */
  now?: number;
};

/** The one track a Provider's track is, by its Provider and the Provider's id. */
function isTrack(track: Track, provider: string, trackId: string): boolean {
  return track.provider === provider && track.trackId === trackId;
}

export function matchesBlocklistEntry(
  track: Track,
  entry: BlocklistEntry,
): boolean {
  if (entry.kind === "track")
    return isTrack(track, entry.provider, entry.trackId);
  if (entry.provider !== undefined && entry.provider !== track.provider)
    return false;
  if (entry.provider !== undefined && entry.channelId && track.channelId)
    return entry.channelId === track.channelId;
  return entry.channelUrl !== "" && entry.channelUrl === track.channelUrl;
}

/**
 * Why the Request behind `context` is refused, by the Rules in their table's
 * order — `undefined` when every Rule that is checked passes. Duration
 * bounds check only what the Provider already knows; without the API Key a
 * track's duration is not known yet, and the bounds it was accepted with
 * wait for its Start Check (ADR-0005). Music only passes what is known not
 * to be music — where the Provider could not say, it is not checked.
 */
export function checkRules(
  rules: ResolvedRules,
  context: RulesContext,
): RefusalReason | undefined {
  const { track } = context;
  const waiting = context.waiting ?? [];
  const history = context.history ?? [];
  const blocklist = context.blocklist ?? [];
  const requester = context.requester ?? {
    requesterPlatform: "",
    requesterId: "",
  };

  if (!rules.requestsOpen) return "closed";

  if (track.duration !== undefined) {
    if (
      rules.longestDurationSeconds !== undefined &&
      track.duration > rules.longestDurationSeconds
    ) {
      return "too-long";
    }
    if (
      rules.shortestDurationSeconds !== undefined &&
      track.duration < rules.shortestDurationSeconds
    ) {
      return "too-short";
    }
  }

  if (rules.waitingPerRequester !== undefined && requester.requesterId !== "") {
    const waitingOfRequester = waiting.filter(
      (song) =>
        song.requesterPlatform === requester.requesterPlatform &&
        song.requesterId === requester.requesterId,
    ).length;
    // A Request without an id is not counted — only what identifies a
    // Requester can limit one.
    if (waitingOfRequester >= rules.waitingPerRequester) {
      return "requester-limit";
    }
  }

  if (rules.queueSize !== undefined && waiting.length >= rules.queueSize) {
    return "queue-full";
  }

  if (rules.refuseAlreadyQueued) {
    const isWaiting = waiting.some((song) =>
      isTrack(song, track.provider, track.trackId),
    );
    const onAir =
      context.current !== undefined &&
      isTrack(context.current, track.provider, track.trackId);
    if (isWaiting || onAir) return "already-queued";
  }

  if (rules.playedWithinSeconds > 0) {
    const now = context.now ?? Date.now();
    const recently = history.some(
      (entry) =>
        isTrack(entry.song, track.provider, track.trackId) &&
        now - entry.at < rules.playedWithinSeconds * 1000,
    );
    if (recently) return "recently-played";
  }

  if (rules.enforceBlocklist) {
    const blocked = blocklist.some((entry) =>
      matchesBlocklistEntry(track, entry),
    );
    if (blocked) return "blocked";
  }

  if (rules.musicOnly && track.music === false) return "not-music";

  return undefined;
}

/** The duration bounds a Song accepted under `rules` travels with. */
export function durationBoundsOf(
  rules: ResolvedRules,
): { maxSeconds?: number; minSeconds?: number } | undefined {
  const bounds: { maxSeconds?: number; minSeconds?: number } = {};
  if (rules.longestDurationSeconds !== undefined) {
    bounds.maxSeconds = rules.longestDurationSeconds;
  }
  if (rules.shortestDurationSeconds !== undefined) {
    bounds.minSeconds = rules.shortestDurationSeconds;
  }
  return bounds.maxSeconds === undefined && bounds.minSeconds === undefined
    ? undefined
    : bounds;
}

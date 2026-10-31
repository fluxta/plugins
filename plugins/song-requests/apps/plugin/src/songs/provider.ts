/**
 * The Provider seam (ADR-0003): a music service turns a Request into a track
 * and plays one Song at a time on its Player. Nothing above it — the Song
 * Queue, Request Song — knows which service a Song comes from.
 */

/** One playable item of a Provider, before it is accepted as a Song. */
export type Track = {
  /** The Provider's `id`. */
  provider: string;
  /** The Provider's own id for it — YouTube's video id. */
  trackId: string;
  title: string;
  channel: string;
  /** The Provider's stable channel id, when known. */
  channelId?: string;
  /** The channel's address, which a channel in the Blocklist is matched by without the API Key. */
  channelUrl: string;
  /** A link to it a viewer can open. */
  url: string;
  /**
   * In seconds; unknown when its Provider could not tell it, until its Player
   * does, at the Song's Start Check.
   */
  duration?: number;
  /**
   * Whether the Provider counts it as music — YouTube's category 10, known
   * only with the API Key. Music only is not checked where it is unknown
   * (ADR-0005).
   */
  music?: boolean;
};

/** Who a Request is from and the scenario's opaque label for it. */
export type RequestMetadata = {
  requesterPlatform: string;
  requesterId: string;
  requesterName: string;
  reference: string;
};

/** What a Player is handed: a Song, or the Fallback Playlist's track (ADR-0003). */
export type Playable = Track & {
  /** Its own id, unique while it is on air — what the Player and its events name it by. */
  id: string;
};

/** A Request accepted into the Song Queue. */
export type Song = Playable &
  RequestMetadata & {
    /** Arrival order, independent of the Song's current place in the Song Queue. */
    requestOrder?: number;
    /**
     * The duration bounds it was accepted with — its step's Overrides
     * included. They travel with it and are checked at its Start Check,
     * when its Player is the first to know how long it is (ADR-0005).
     */
    durationBounds?: { maxSeconds?: number; minSeconds?: number };
  };

/**
 * The Fallback Playlist's track on air. It is not a Song: Playability
 * applies to it, but no Rules, no Events, no History.
 */
export type FallbackTrack = Playable;

/** Why a Song left the Song Queue without ever being heard. */
export type SongDroppedReason =
  "unavailable" | "too-long" | "too-short" | "removed" | "cleared" | "blocked";

/**
 * Why a Request did not become a Song. The canonical list lives in
 * `song-requests-protocol`: the Plugin Editor shows a Refusal's reason.
 */
import type {
  RefusalReason,
  PlayerPlaybackState,
} from "song-requests-protocol";

export type { RefusalReason };

export type Resolution =
  { kind: "track"; track: Track } | { kind: "refused"; reason: RefusalReason };

/** The Song Queue's checks, so a search can try the next playable candidate. */
export type ResolveOptions = {
  musicOnly: boolean;
  refusalOf(track: Track): RefusalReason | undefined;
};

/** What a Player tells the Song Queue. */
export interface PlayerEvents {
  /** Actual playback and position, including the Player's own controls. */
  playback(songId: string, state: PlayerPlaybackState, position: number): void;
  /** It can play now — a Player Page connected. */
  ready(): void;
  /** Its Player Page went away; playback waits at the last position. */
  disconnected(): void;
  /**
   * The Song plays — muted, if it was played so — and is this long, in
   * seconds; `undefined` for a live stream, which has no end. `title` is
   * the player's own, how a Fallback Track learned without the API Key is
   * named.
   */
  loaded(songId: string, duration: number | undefined, title?: string): void;
  /** The Song played to its end. */
  ended(songId: string): void;
  /** The Song could not be played, or broke while playing. */
  failed(songId: string): void;
}

export type PlayOptions = {
  muted: boolean;
  startAt?: number;
  paused?: boolean;
  volume?: number;
};

/** Where a Provider's Songs play. It is told one Song at a time and holds no queue. */
export interface Player {
  /** Whether a Song handed over now would play. */
  readonly ready: boolean;
  /** A connected Player may be preparing; absent when connection and readiness are the same. */
  readonly connected?: boolean;
  /**
   * Plays the Song in place of whatever was on. A muted Song is not heard
   * until `unmute` — its Start Check. `startAt` is seconds in to start at:
   * the Current Song goes on from where a restart found it (ADR-0002).
   * A pause and volume accompany a load so a new Player Page applies them
   * before anything is heard.
   */
  play(song: Playable, options: PlayOptions): void;
  /** Lets the Song on air be heard; a Song that is no longer on air stays as it is. */
  unmute(songId: string): void;
  /** Stops whatever is on; nothing plays until the next `play`. */
  stop(): void;
  pause(): void;
  resume(): void;
  setVolume(volume: number): void;
  /** How the Song Queue hears from it. */
  attach(events: PlayerEvents): void;
}

export interface Provider {
  readonly id: string;
  /**
   * Whether the Request is a link of this Provider's. A Request no Provider
   * claims is search words, which the default Provider answers.
   */
  claims(request: string): boolean;
  resolve(request: string, options?: ResolveOptions): Promise<Resolution>;
  readonly player: Player;
}

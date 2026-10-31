import {
  FALLBACK_RULE_DEFAULTS,
  type BlocklistEntry,
  type HistoryEntry as EditorHistoryEntry,
  type PlaybackStatus,
  type PlayerPlaybackState,
  type RequestSongOverrides,
  type RuleDefaults,
} from "song-requests-protocol";

import type {
  FallbackTrack,
  Player,
  Playable,
  Provider,
  RefusalReason,
  RequestMetadata,
  Song,
  SongDroppedReason,
  Track,
} from "./provider";
import { recordInHistory, trimHistory, type HistoryEntry } from "./history";
import {
  checkRules,
  durationBoundsOf,
  resolveRules,
  matchesBlocklistEntry,
} from "./rules";

/** How Request Song is answered. */
export type RequestAnswer =
  | {
      kind: "accepted";
      song: Song;
      /** Its place among the waiting Songs, 1 first; 0 when it went on air at once. */
      position: number;
      /**
       * Seconds until it should start: what is left of the Current Song and
       * every Song ahead; `undefined` when a duration it needs is not known.
       */
      eta: number | undefined;
    }
  | { kind: "refused"; reason: RefusalReason };

export type RemoveSongTarget =
  | {
      kind: "requesterLatest" | "requesterAll";
      requesterPlatform: string;
      requesterId: string;
    }
  | { kind: "position"; position: number }
  | { kind: "songId"; songId: string };

export type GetSongTarget =
  | { kind: "current" }
  | { kind: "position"; position: number }
  | { kind: "requesterNext"; requesterPlatform: string; requesterId: string };

/** What is on air: the Current Song, or the Fallback Playlist's track. */
type OnAir = {
  /**
   * Its duration is not known, so it plays muted until its Player tells it —
   * however long that takes: a Song buffering through a network drop is not
   * failing (spike #3).
   */
  atStartCheck: boolean;
  /** It has been heard, so its end is Song Ended rather than Song Dropped. */
  started: boolean;
  loaded?: boolean;
  playerState?: PlayerPlaybackState;
  /** When it began to play, by `Date.now()`; unset until its Player says so. */
  since?: number;
  /** How far it has played, in seconds, as of `since`. */
  position: number;
  /**
   * Seconds in to resume at once its Player is ready — saved by the State
   * file for the Current Song of a restarted plugin (ADR-0002).
   */
  resumeAt?: number;
} & ({ kind: "song"; song: Song } | { kind: "fallback"; track: FallbackTrack });

function trackOf(onAir: OnAir): Playable {
  return onAir.kind === "song" ? onAir.song : onAir.track;
}

/** The Song Queue as the State file keeps it (ADR-0002). */
export type SongQueueSnapshot = {
  requestsOpen?: boolean;
  isPaused?: boolean;
  volume?: number;
  waiting: Song[];
  current?: {
    song: Song;
    atStartCheck: boolean;
    /** It has been heard: coming back, it goes on without a second Song Started. */
    started: boolean;
    /** How far it has played, in seconds. */
    position: number;
  };
  /** The Songs that left the air, newest first: at most 200, none older than 30 days. */
  history: HistoryEntry[];
};

/**
 * The plugin's single Song Queue: Songs waiting in order of arrival, played
 * one at a time. It owns the order; a Provider's Player is told one Song at a
 * time (ADR-0003). It also applies the Rules — each one above the Provider
 * seam, over the track a Provider resolved — and keeps the History.
 */
export class SongQueue {
  readonly #providers: Provider[];
  readonly #newId: () => string;
  readonly #random: () => number;
  readonly #rules: {
    defaults: () => RuleDefaults;
    blocklist: () => BlocklistEntry[];
  };
  readonly #onStarted?: (song: Song) => void;
  readonly #onEnded?: (
    song: Song,
    how: "finished" | "failed" | "skipped",
  ) => void;
  readonly #onDropped?: (song: Song, why: SongDroppedReason) => void;
  readonly #onChange?: () => void;
  readonly #onBlock?: (entry: BlocklistEntry) => boolean;
  readonly #waiting: Song[] = [];
  #current?: OnAir;
  #history: HistoryEntry[];
  #requestsOpen?: boolean;
  #paused: boolean;
  #volume: number;
  #requestOrder = 0;
  /**
   * The learned Fallback Playlist: its tracks and the shuffled order they
   * play in, `cursor` the next index. Lear anew when the playlist is set
   * and when the plugin starts; after the last track the order is shuffled
   * again. Nothing of it goes in the State file.
   */
  #fallback?: { tracks: FallbackTrack[]; order: number[]; cursor: number };

  constructor({
    providers,
    newId,
    random,
    initial,
    rules,
    onStarted,
    onEnded,
    onDropped,
    onChange,
    onBlock,
  }: {
    /** The first is the default one, which answers search words. */
    providers: Provider[];
    newId: () => string;
    /** The shuffle's source of randomness — seeded in tests. */
    random?: () => number;
    /** What the State file saved: the queue comes back as it was (ADR-0002). */
    initial?: SongQueueSnapshot;
    /**
     * The Rules' Defaults and the Blocklist, as they stand now — they are
     * Plugin settings, which change while the queue lives. Without this the
     * #1 Defaults and an empty Blocklist apply.
     */
    rules?: {
      defaults: () => RuleDefaults;
      blocklist: () => BlocklistEntry[];
    };
    onStarted?: (song: Song) => void;
    onEnded?: (song: Song, how: "finished" | "failed" | "skipped") => void;
    onDropped?: (song: Song, why: SongDroppedReason) => void;
    /** Adds a Blocklist entry to Plugin settings; false leaves every Song intact. */
    onBlock?: (entry: BlocklistEntry) => boolean;
    /** The queue changed in a way the State file should keep. */
    onChange?: () => void;
  }) {
    this.#providers = providers;
    this.#newId = newId;
    this.#random = random ?? Math.random;
    this.#rules = rules ?? {
      defaults: () => FALLBACK_RULE_DEFAULTS,
      blocklist: () => [],
    };
    this.#onStarted = onStarted;
    this.#onEnded = onEnded;
    this.#onDropped = onDropped;
    this.#onChange = onChange;
    this.#onBlock = onBlock;
    this.#requestsOpen = initial?.requestsOpen;
    this.#paused = initial?.isPaused ?? false;
    this.#volume = initial?.volume ?? 100;

    this.#waiting.push(...(initial?.waiting ?? []));
    this.#requestOrder = Math.max(
      0,
      ...this.#waiting.map((song) => song.requestOrder ?? 0),
    );
    // Entries older than the History keeps are dropped on the way in, so a
    // long-closed plugin does not carry them forever.
    this.#history = trimHistory(initial?.history ?? []);
    if (initial?.current) {
      const { song, atStartCheck, started, position } = initial.current;
      this.#current = {
        kind: "song",
        song,
        atStartCheck,
        started,
        position,
        // It waits, paused, for its Player; `since` starts on the Player's
        // word, and a heard Song resumes where it had played.
        since: undefined,
        resumeAt: started ? position : undefined,
      };
    }

    for (const provider of providers) {
      provider.player.attach({
        playback: (songId, state, position) =>
          this.#playbackChanged(songId, state, position),
        ready: () => this.#resume(provider),
        disconnected: () => this.#disconnected(provider),
        loaded: (songId, duration, title) =>
          this.#loaded(songId, duration, title),
        ended: (songId) => this.#ended(songId),
        failed: (songId) => this.#failed(songId),
      });
    }
  }

  /** The Song Queue as the State file keeps it. */
  snapshot(): SongQueueSnapshot {
    const current = this.#current;
    return {
      requestsOpen: this.requestsOpen,
      isPaused: this.#paused,
      volume: this.#volume,
      waiting: [...this.#waiting],
      current:
        current?.kind === "song"
          ? {
              song: current.song,
              atStartCheck: current.atStartCheck,
              started: current.started,
              position: this.#positionOf(current),
            }
          : undefined,
      history: [...this.#history],
    };
  }

  /**
   * How far the Current Song has played, in seconds. Away from its Player
   * nothing of it plays — neither while it waits for one nor through a
   * restart — so only a playing Player moves it on.
   */
  #positionOf(current: OnAir): number {
    const playing =
      !this.#paused &&
      current.since !== undefined &&
      this.#playerOf(trackOf(current))?.ready;
    return (
      current.position + (playing ? (Date.now() - current.since!) / 1000 : 0)
    );
  }

  /**
   * A Player that comes back — a Player Page opened again — gets what was
   * on air again if it is its Provider's, or the next Song or Fallback
   * Track if nothing is on air.
   */
  #resume(provider: Provider): void {
    provider.player.setVolume(this.#volume);
    const current = this.#current;
    if (current && this.#playerOf(trackOf(current)) === provider.player) {
      if (current.started && current.resumeAt === undefined) {
        current.resumeAt = this.#positionOf(current);
      }
      this.#start(current, provider.player);
      // A replacement page is ready before it has loaded the Current Song.
      this.#onChange?.();
      return;
    }
    this.#advance();
  }

  #disconnected(provider: Provider): void {
    const current = this.#current;
    if (!current || trackOf(current).provider !== provider.id) return;
    if (current.since !== undefined && !this.#paused) {
      current.position += (Date.now() - current.since) / 1000;
    }
    current.since = undefined;
    current.loaded = false;
    current.playerState = undefined;
    this.#onChange?.();
  }

  #playbackChanged(
    songId: string,
    state: PlayerPlaybackState,
    position: number,
  ): void {
    const current = this.#current;
    if (!current || trackOf(current).id !== songId) return;
    current.playerState = state;
    // Pause and Play from a Player update the same state as the Playback
    // Action. Buffering is a wait, and must not change that decision.
    if (state === "paused") this.#paused = true;
    else if (state === "playing") this.#paused = false;
    if (current.loaded && !current.atStartCheck) {
      current.position = position;
      current.since = state === "playing" ? Date.now() : undefined;
      if (state === "playing" && !current.started) {
        current.started = true;
        if (current.kind === "song") this.#onStarted?.(current.song);
      }
    }
    this.#onChange?.();
  }

  /**
   * Its Player tells how long what is on air is. At its Start Check that
   * decides it: a live stream has no end and is dropped before anything of
   * it is heard (ADR-0005); a Song outside the duration bounds it was
   * accepted with is dropped as `too-long` or `too-short`, still unheard;
   * any other is unmuted and goes on. A Fallback Track learned without the
   * API Key takes its title and duration from here.
   */
  #loaded(songId: string, duration: number | undefined, title?: string): void {
    const current = this.#current;
    if (!current || trackOf(current).id !== songId) return;

    if (current.atStartCheck) {
      if (duration === undefined) {
        if (current.kind === "song") this.#drop(current, true, "unavailable");
        else this.#skipFallback(current, true);
        return;
      }
      if (current.kind === "song") {
        const bounds = current.song.durationBounds;
        if (bounds?.maxSeconds !== undefined && duration > bounds.maxSeconds) {
          this.#drop(current, true, "too-long");
          return;
        }
        if (bounds?.minSeconds !== undefined && duration < bounds.minSeconds) {
          this.#drop(current, true, "too-short");
          return;
        }
        current.song = { ...current.song, duration };
      } else {
        // A keyless Fallback Track: what the player reports is all there is.
        current.track = {
          ...current.track,
          duration,
          ...(title !== undefined ? { title } : {}),
        };
      }
      current.atStartCheck = false;
      this.#playerOf(trackOf(current))?.unmute(songId);
    }

    current.loaded = true;
    if (!this.#paused) current.since ??= Date.now();
    if (!current.started && !this.#paused) {
      current.started = true;
      if (current.kind === "song") this.#onStarted?.(current.song);
    }
    this.#onChange?.();
  }

  /** What is on air played to its end, if it ever went on air. */
  #ended(songId: string): void {
    const current = this.#endedOrFailed(songId);
    if (current) this.#finish(current, "finished");
  }

  /**
   * A Player error drops a Song before it is heard, or fails it on air; a
   * Fallback Track that fails at load — or breaks — is only skipped.
   */
  #failed(songId: string): void {
    const current = this.#endedOrFailed(songId);
    if (current) this.#finish(current, "failed");
  }

  /**
   * What `#ended` and `#failed` share: what is on air stopped by itself or
   * broke. One that never started is dropped or skipped unheard; a Fallback
   * Track leaves no trace — no Event, no History — and the next thing goes
   * on. Returns the heard Song to record, if one was on air.
   */
  #endedOrFailed(songId: string): Extract<OnAir, { kind: "song" }> | undefined {
    const current = this.#current;
    if (!current || trackOf(current).id !== songId) return undefined;
    if (!current.started) {
      if (current.kind === "song") this.#drop(current, false);
      else this.#skipFallback(current, false);
      return undefined;
    }
    if (current.kind === "fallback") {
      this.#skipFallback(current, false);
      return undefined;
    }
    return current;
  }

  /** Every heard Song leaves the air through the same History and Event ordering. */
  #finish(
    current: Extract<OnAir, { kind: "song" }>,
    how: HistoryEntry["how"],
    stop = false,
  ): void {
    this.#current = undefined;
    if (stop) this.#playerOf(current.song)?.stop();
    this.#recordHowItLeft(current.song, how);
    this.#onEnded?.(current.song, how);
    this.#onChange?.();
    this.#advance();
  }

  /** A Song that was heard enters the History, newest first. */
  #recordHowItLeft(song: Song, how: "finished" | "failed" | "skipped"): void {
    this.#history = recordInHistory(this.#history, {
      song,
      how,
      at: Date.now(),
    });
  }

  /** The Song goes without being heard; a live Start Check still needs stopping. */
  #drop(
    current: Extract<OnAir, { kind: "song" }>,
    stop: boolean,
    why: SongDroppedReason = "unavailable",
  ): void {
    this.#current = undefined;
    if (stop) this.#playerOf(current.song)?.stop();
    this.#onDropped?.(current.song, why);
    this.#onChange?.();
    this.#advance();
  }

  /**
   * A Fallback Track leaves nothing behind — no Event, no History — and
   * the next thing goes on; one still loading needs stopping first.
   */
  #skipFallback(
    current: Extract<OnAir, { kind: "fallback" }>,
    stop: boolean,
  ): void {
    this.#current = undefined;
    if (stop) this.#playerOf(current.track)?.stop();
    this.#onChange?.();
    this.#advance();
  }

  /**
   * Puts the next Song on air if there is one; otherwise the next Fallback
   * Track, while the Song Queue is empty and a Fallback Playlist is learned.
   */
  #advance(): void {
    if (this.#current || this.#paused) return;
    const next = this.#waiting[0];
    if (next) {
      const player = this.#playerOf(next);
      if (!player?.ready) return;
      this.#waiting.shift();
      this.#current = {
        kind: "song",
        song: next,
        atStartCheck: next.duration === undefined,
        started: false,
        position: 0,
      };
      this.#onChange?.();
      this.#start(this.#current, player);
      return;
    }
    const track = this.#peekFallback();
    const player = track && this.#playerOf(track);
    if (!track || !player?.ready) return;
    this.#takeFallback();
    this.#current = {
      kind: "fallback",
      track,
      atStartCheck: track.duration === undefined,
      started: false,
      position: 0,
    };
    this.#onChange?.();
    this.#start(this.#current, player);
  }

  /**
   * Plays what is on air — muted at its Start Check, from `resumeAt` when
   * the State file brings a heard Song back (ADR-0002), else from its start.
   */
  #start(current: OnAir, player: Player): void {
    current.loaded = false;
    current.playerState = undefined;
    current.since = undefined;
    if (current.resumeAt !== undefined) {
      current.position = current.resumeAt;
      player.play(trackOf(current), {
        muted: current.atStartCheck,
        startAt: current.resumeAt,
        paused: this.#paused,
        volume: this.#volume,
      });
      current.resumeAt = undefined;
      return;
    }
    current.position = 0;
    player.play(trackOf(current), {
      muted: current.atStartCheck,
      paused: this.#paused,
      volume: this.#volume,
    });
  }

  #playerOf(playable: Playable) {
    return this.#providers.find((p) => p.id === playable.provider)?.player;
  }

  blockSong(
    target: { kind: "current" } | { kind: "songId"; songId: string },
    kind: "track" | "channel",
  ): Song | undefined {
    const song =
      target.kind === "current"
        ? this.#current?.kind === "song"
          ? this.#current.song
          : undefined
        : this.#current?.kind === "song" &&
            this.#current.song.id === target.songId
          ? this.#current.song
          : this.#waiting.find((song) => song.id === target.songId);
    if (!song) return undefined;
    return this.#block(song, kind);
  }

  /**
   * Blocks a History Song's track or channel — the Plugin Editor's History
   * (#14): the same Blocklist entry and the same drops as Block Song, which
   * is what Block Song does by `songId` for a waiting or Current Song. The
   * History itself is left as it is.
   */
  blockHistorySong(
    songId: string,
    kind: "track" | "channel",
  ): Song | undefined {
    const entry = this.#history.find((entry) => entry.song.id === songId);
    if (!entry) return undefined;
    return this.#block(entry.song, kind);
  }

  /** What Block Song and the History's block share: the entry and the drops. */
  #block(song: Song, kind: "track" | "channel"): Song | undefined {
    if (!this.#onBlock) return undefined;
    const entry: BlocklistEntry =
      kind === "track"
        ? { kind: "track", provider: song.provider, trackId: song.trackId }
        : {
            kind: "channel",
            provider: song.provider,
            ...(song.channelId ? { channelId: song.channelId } : {}),
            channelUrl: song.channelUrl,
          };
    if (entry.kind === "channel" && !entry.channelId && !entry.channelUrl)
      return undefined;
    if (!this.#onBlock(entry)) return undefined;
    // Remove all matches before advancing, so a blocked Song can never be handed to a Player.
    const waiting = this.#waiting.filter((waiting) =>
      matchesBlocklistEntry(waiting, entry),
    );
    this.#dropWaiting(waiting, "blocked");
    const current = this.#current;
    if (
      current?.kind === "song" &&
      matchesBlocklistEntry(current.song, entry)
    ) {
      if (current.started) this.#finish(current, "skipped", true);
      else this.#drop(current, true, "blocked");
    } else this.#advance();
    return song;
  }

  /**
   * Queues a History Song again — the Plugin Editor's History (#14): its
   * link is requested as the streamer's own, checked with the Defaults the
   * way the add field's Request is. `undefined` names a Song the History no
   * longer holds.
   */
  queueAgain(songId: string): Promise<RequestAnswer | undefined> {
    const entry = this.#history.find((entry) => entry.song.id === songId);
    if (!entry) return Promise.resolve(undefined);
    return this.request(entry.song.url);
  }

  get requestsOpen(): boolean {
    return this.#requestsOpen ?? this.#rules.defaults().requestsOpen;
  }

  requests(mode: "open" | "close" | "toggle"): boolean {
    const isOpen =
      mode === "open"
        ? true
        : mode === "close"
          ? false
          : mode === "toggle"
            ? !this.requestsOpen
            : this.requestsOpen;
    this.#requestsOpen = isOpen;
    this.#onChange?.();
    return isOpen;
  }

  getSong(
    target: GetSongTarget,
  ): { song: Song; position: number; eta: number | undefined } | undefined {
    if (target.kind === "current") {
      return this.#current?.kind === "song"
        ? { song: this.#current.song, position: 0, eta: 0 }
        : undefined;
    }
    const song =
      target.kind === "position"
        ? Number.isInteger(target.position) && target.position > 0
          ? this.#waiting[target.position - 1]
          : undefined
        : target.requesterId === ""
          ? undefined
          : this.#waiting.find(
              (song) =>
                song.requesterPlatform === target.requesterPlatform &&
                song.requesterId === target.requesterId,
            );
    return (
      song && {
        song,
        position: this.#waiting.indexOf(song) + 1,
        eta: this.#etaOf(song),
      }
    );
  }

  #dropWaiting(songs: Song[], why: SongDroppedReason): void {
    if (!songs.length) return;
    for (const song of songs)
      this.#waiting.splice(this.#waiting.indexOf(song), 1);
    for (const song of songs) this.#onDropped?.(song, why);
    this.#onChange?.();
  }

  clear(): number {
    const songs = [...this.#waiting];
    this.#dropWaiting(songs, "cleared");
    return songs.length;
  }

  /** Removes waiting Songs only; a Requester is identified by Platform and id. */
  remove(target: RemoveSongTarget): Song[] {
    let matches: Song[];
    if (target.kind === "position") {
      const song =
        Number.isInteger(target.position) && target.position > 0
          ? this.#waiting[target.position - 1]
          : undefined;
      matches = song ? [song] : [];
    } else if (target.kind === "songId") {
      matches = this.#waiting.filter((song) => song.id === target.songId);
    } else {
      matches =
        target.requesterId === ""
          ? []
          : this.#waiting.filter(
              (song) =>
                song.requesterPlatform === target.requesterPlatform &&
                song.requesterId === target.requesterId,
            );
      if (target.kind === "requesterLatest") {
        const latest = matches.reduce<Song | undefined>(
          (latest, song) =>
            !latest || (song.requestOrder ?? 0) >= (latest.requestOrder ?? 0)
              ? song
              : latest,
          undefined,
        );
        matches = latest ? [latest] : [];
      }
    }
    this.#dropWaiting(matches, "removed");
    if (matches.length) this.#advance();
    return matches;
  }

  /**
   * Moves a waiting Song to another place in the Song Queue — the drag in
   * the Plugin Editor. `toPosition` is 1-based among the waiting Songs.
   * Only the order changes; the Current Song is not touched.
   */
  reorder(songId: string, toPosition: number): void {
    const from = this.#waiting.findIndex((song) => song.id === songId);
    if (from === -1) return;
    const [song] = this.#waiting.splice(from, 1);
    const to = Math.min(
      this.#waiting.length,
      Math.max(0, Math.round(toPosition) - 1),
    );
    if (to === from) {
      this.#waiting.splice(to, 0, song);
      return;
    }
    this.#waiting.splice(to, 0, song);
    this.#onChange?.();
  }

  /** Makes a waiting Song the first to play after what is on air. */
  moveToNext(songId: string): void {
    this.reorder(songId, 1);
  }

  /** Ends what is on air; a Fallback Track is skipped, with no Song Event. */
  skip(): Playable | undefined {
    const current = this.#current;
    if (!current) return undefined;
    if (current.kind === "fallback") {
      this.#skipFallback(current, true);
      return current.track;
    }
    if (!current.started) {
      this.#drop(current, true, "removed");
    } else {
      this.#finish(current, "skipped", true);
    }
    return current.song;
  }

  /** Pause is shared with the Player's own controls and survives disconnection. */
  playback(mode: "pause" | "resume" | "toggle"): boolean {
    const paused =
      mode === "pause"
        ? true
        : mode === "resume"
          ? false
          : mode === "toggle"
            ? !this.#paused
            : this.#paused;
    if (paused === this.#paused) return paused;
    const current = this.#current;
    if (current && paused) {
      current.position = this.#positionOf(current);
      current.since = undefined;
    }
    this.#paused = paused;
    if (current) {
      const player = this.#playerOf(trackOf(current));
      if (paused) player?.pause();
      else {
        player?.resume();
        if (
          current.loaded &&
          player?.ready &&
          (current.playerState === undefined ||
            current.playerState === "playing")
        ) {
          current.since = Date.now();
          if (!current.started) {
            current.started = true;
            if (current.kind === "song") this.#onStarted?.(current.song);
          }
        }
      }
    }
    this.#onChange?.();
    if (!paused) this.#advance();
    return paused;
  }

  get volume(): number {
    return this.#volume;
  }

  /**
   * Learns the Fallback Playlist's tracks — `undefined` for none set, `[]`
   * for one without a playable track, in which case the player stays
   * silent. The order starts shuffled; after its last track it is shuffled
   * again. What is on air plays on; a Song on air is not interrupted.
   */
  setFallbackTracks(tracks: Track[] | undefined): void {
    if (!tracks?.length) {
      this.#fallback = undefined;
      return;
    }
    this.#fallback = {
      tracks: tracks.map((track) => ({ ...track, id: this.#newId() })),
      order: this.#shuffled(tracks.map((_, index) => index)),
      cursor: 0,
    };
    this.#advance();
  }

  #shuffled<T>(items: T[]): T[] {
    for (let at = items.length - 1; at > 0; at--) {
      const pick = Math.floor(this.#random() * (at + 1));
      [items[at], items[pick]] = [items[pick], items[at]];
    }
    return items;
  }

  /** The next Fallback Track to play, without taking it — its Player may not be ready. */
  #peekFallback(): FallbackTrack | undefined {
    const fallback = this.#fallback;
    return fallback && fallback.order[fallback.cursor] !== undefined
      ? fallback.tracks[fallback.order[fallback.cursor]]
      : undefined;
  }

  /** Takes the peeked track; past the last one the playlist is shuffled again. */
  #takeFallback(): void {
    const fallback = this.#fallback;
    if (!fallback) return;
    fallback.cursor += 1;
    if (fallback.cursor >= fallback.order.length) {
      fallback.order = this.#shuffled(fallback.order.map((_, index) => index));
      fallback.cursor = 0;
    }
  }

  #isPlaying(): boolean {
    const current = this.#current;
    return Boolean(
      current?.started &&
      current.loaded &&
      current.since !== undefined &&
      !this.#paused &&
      this.#playerOf(trackOf(current))?.ready,
    );
  }

  /** State read by Standalone Query Sources; waiting durations exclude what is on air. */
  status() {
    const current = this.#current;
    return {
      isPlaying: this.#isPlaying(),
      isPaused: this.#paused,
      playerConnected: this.#providers.some(
        ({ player }) => player.connected ?? player.ready,
      ),
      currentTitle: (current && trackOf(current).title) || "",
      currentRequester:
        current?.kind === "song" ? current.song.requesterName : "",
      isFallback: current?.kind === "fallback",
      queueLength: this.#waiting.length,
      queueDuration: this.#waiting.reduce(
        (seconds, song) => seconds + (song.duration ?? 0),
        0,
      ),
      volume: this.#volume,
    };
  }

  /**
   * What the Plugin Editor's Now and the queue sections render. Sent with
   * every status; `now` lets the editor tick the progress from its own
   * clock — it runs on this computer.
   */
  editorPlayback(): PlaybackStatus {
    const current = this.#current;
    return {
      now: Date.now(),
      isPlaying: this.#isPlaying(),
      isPaused: this.#paused,
      playerState: current?.playerState ?? null,
      volume: this.#volume,
      requestsOpen: this.requestsOpen,
      current: current
        ? {
            id: trackOf(current).id,
            title: trackOf(current).title,
            channel: trackOf(current).channel,
            url: trackOf(current).url,
            requesterName:
              current.kind === "song" ? current.song.requesterName : "",
            isFallback: current.kind === "fallback",
            duration: trackOf(current).duration ?? null,
            position: this.#positionOf(current),
            atStartCheck: current.atStartCheck,
          }
        : null,
      waiting: this.#waiting.map((song) => ({
        id: song.id,
        title: song.title,
        channel: song.channel,
        url: song.url,
        requesterName: song.requesterName,
        duration: song.duration ?? null,
        eta: this.#etaOf(song) ?? null,
      })),
    };
  }

  /**
   * The Songs that left the air, newest first, as the Plugin Editor's
   * History section lists them (#14).
   */
  editorHistory(): EditorHistoryEntry[] {
    return trimHistory(this.#history).map((entry) => ({
      id: entry.song.id,
      title: entry.song.title,
      channel: entry.song.channel,
      url: entry.song.url,
      requesterName: entry.song.requesterName,
      duration: entry.song.duration ?? null,
      how: entry.how,
      at: entry.at,
    }));
  }

  setVolume(value: number): void {
    if (!Number.isFinite(value)) return;
    const volume = Math.round(Math.max(0, Math.min(100, value)));
    if (volume === this.#volume) return;
    this.#volume = volume;
    for (const { player } of this.#providers) player.setVolume(volume);
    this.#onChange?.();
  }

  /** Seconds until a waiting Song should start, if every duration it needs is known. */
  #etaOf(song: Song): number | undefined {
    let seconds = 0;

    if (this.#current) {
      const duration = trackOf(this.#current).duration;
      if (duration === undefined) return undefined;
      seconds += Math.max(0, duration - this.#positionOf(this.#current));
    }

    for (const ahead of this.#waiting) {
      if (ahead === song) break;
      if (ahead.duration === undefined) return undefined;
      seconds += ahead.duration;
    }

    return Math.round(seconds);
  }

  async request(
    request: string,
    metadata: RequestMetadata = {
      requesterPlatform: "",
      requesterId: "",
      requesterName: "",
      reference: "",
    },
    options: {
      overrides?: RequestSongOverrides;
      position?: "inTurn" | "next";
    } = {},
  ): Promise<RequestAnswer> {
    const provider =
      this.#providers.find((p) => p.claims(request)) ?? this.#providers[0];
    const currentRules = () =>
      resolveRules(options.overrides, {
        ...this.#rules.defaults(),
        requestsOpen: this.requestsOpen,
      });
    const rules = currentRules();
    // A search tries candidates through the same Rules as a link. The
    // Provider knows no queue or Rules, only how to ask whether a track passes.
    const refusalOf = (track: Track) =>
      checkRules(currentRules(), {
        track,
        requester: {
          requesterPlatform: metadata.requesterPlatform,
          requesterId: metadata.requesterId,
        },
        waiting: this.#waiting,
        current:
          this.#current?.kind === "song" ? this.#current.song : undefined,
        history: this.#history,
        blocklist: this.#rules.blocklist(),
      });
    const resolution = await provider.resolve(request, {
      musicOnly: rules.musicOnly,
      refusalOf,
    });

    if (resolution.kind === "refused") return resolution;

    // Another Request may have changed the Song Queue while this one resolved.
    const reason = refusalOf(resolution.track);
    if (reason) {
      return { kind: "refused", reason };
    }

    const song: Song = {
      ...resolution.track,
      ...metadata,
      id: this.#newId(),
      requestOrder: ++this.#requestOrder,
      // The bounds it was accepted with travel with it: without the API
      // Key its duration is learned only at its Start Check (ADR-0005).
      durationBounds: durationBoundsOf(currentRules()),
    };
    if (options.position === "next") this.#waiting.unshift(song);
    else this.#waiting.push(song);
    this.#advance();

    const position = this.#waiting.indexOf(song) + 1;
    // Advancing saves a Song that went on air; a waiting Song needs saving
    // too, including when no Player Page has connected yet.
    if (position > 0) this.#onChange?.();
    return {
      kind: "accepted",
      song,
      position,
      eta: position === 0 ? 0 : this.#etaOf(song),
    };
  }
}

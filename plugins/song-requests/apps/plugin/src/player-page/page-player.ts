import {
  isPageMessage,
  KEY_CHANGED_CLOSE_CODE,
  REPLACED_CLOSE_CODE,
  type PageMessage,
  type SidecarMessage,
} from "song-requests-protocol";

import type {
  Playable,
  Player,
  PlayerEvents,
  PlayOptions,
} from "../songs/provider";

/** A missing playlist must not hold up playback or later readings forever. */
const PLAYLIST_TIMEOUT_MS = 10_000;

/** One Player Page's WebSocket, as narrow as the Player needs it. */
export interface PageSocket {
  send(text: string): void;
  /**
   * Closed with a code the page understands: another page took over, or the
   * Player Key changed. Either way this one stops, and stays closed.
   */
  close(code: number): void;
  onMessage(listener: (text: string) => void): void;
  onClose(listener: () => void): void;
}

/**
 * YouTube's Player: the Player Page open in OBS, driven over its WebSocket
 * (ADR-0001). A connected page is ready except while listing a playlist.
 */
export class PagePlayer implements Player {
  #page?: PageSocket;
  #events?: PlayerEvents;
  readonly #connectionListeners: ((connected: boolean) => void)[] = [];
  #activeSongId?: string;
  #nextListing = 0;
  #reading = false;
  #readyTimer?: ReturnType<typeof setTimeout>;
  #listing?: {
    requestId: string;
    playlistId: string;
    resolve: (ids: string[]) => void;
    timer?: ReturnType<typeof setTimeout>;
  };

  get ready(): boolean {
    return this.connected && !this.#reading;
  }

  get connected(): boolean {
    return this.#page !== undefined;
  }

  attach(events: PlayerEvents): void {
    this.#events = events;
  }

  onConnectionChange(listener: (connected: boolean) => void): void {
    this.#connectionListeners.push(listener);
  }

  /**
   * Makes the page the one that plays. The page opened last takes over — so
   * reopening OBS just works — and the one before it is closed; only the
   * current page's messages count.
   */
  connect(page: PageSocket): void {
    const before = this.#page;
    this.#cancelListing();
    this.#activeSongId = undefined;
    this.#page = page;

    page.onMessage((text) => {
      if (this.#page === page) this.#receive(text);
    });
    page.onClose(() => {
      if (this.#page !== page) return;
      this.#disconnect();
    });

    before?.close(REPLACED_CLOSE_CODE);
    this.#tellConnection();
    if (this.ready) this.#events?.ready();
  }

  /**
   * The Player Key was replaced: the open page is closed for good — the
   * address it holds no longer works — and what is on air waits, as with
   * any disconnect, until the page opened at the new address connects.
   */
  closeForKeyChange(): void {
    const page = this.#page;
    if (!page) return;
    // The WebSocket close handshake waits for the peer: revoke its control
    // before it can send more messages with the replaced Player Key.
    this.#disconnect();
    page.close(KEY_CHANGED_CLOSE_CODE);
  }

  #disconnect(): void {
    this.#page = undefined;
    // A cue whose page went away lists nothing; the playlist is learned
    // anew when a page connects.
    this.#cancelListing();
    this.#activeSongId = undefined;
    this.#events?.disconnected();
    this.#tellConnection();
  }

  play(song: Playable, { muted, startAt, paused, volume }: PlayOptions): void {
    this.#activeSongId = song.id;
    this.#send({
      event: "load",
      songId: song.id,
      videoId: song.trackId,
      muted,
      startAt: startAt ?? 0,
      ...(paused === undefined ? {} : { paused }),
      ...(volume === undefined ? {} : { volume }),
    });
  }

  unmute(songId: string): void {
    this.#send({ event: "unmute", songId });
  }

  stop(): void {
    this.#send({ event: "stop" });
    this.#activeSongId = undefined;
    this.#cueWhenIdle();
  }

  pause(): void {
    this.#send({ event: "pause" });
  }
  resume(): void {
    this.#send({ event: "resume" });
  }
  setVolume(volume: number): void {
    this.#send({ event: "volume", volume });
  }

  /**
   * The keyless way of learning the Fallback Playlist: cues it in the page
   * — never to play it (ADR-0003) — and takes what `getPlaylist()` lists.
   * YouTube's player loads a long playlist's entries in chunks, so a long
   * one may list only its first entries. Without a connected page, `[]`.
   * Waits for the track on air to leave; while cuing, the Song Queue waits
   * for this Player to be ready again rather than loading another track.
   */
  listPlaylist(playlistId: string): Promise<string[]> {
    if (!this.#page) return Promise.resolve([]);
    this.#cancelListing();
    return new Promise((resolve) => {
      this.#listing = {
        requestId: String(++this.#nextListing),
        playlistId,
        resolve,
      };
      this.#cueWhenIdle();
    });
  }

  #cueWhenIdle(): void {
    const listing = this.#listing;
    if (!listing || this.#activeSongId || this.#reading) return;
    this.#reading = true;
    listing.timer = setTimeout(
      () => this.#finishListing([]),
      PLAYLIST_TIMEOUT_MS,
    );
    this.#send({
      event: "cue",
      requestId: listing.requestId,
      playlistId: listing.playlistId,
    });
  }

  #cancelListing(): void {
    const listing = this.#listing;
    this.#listing = undefined;
    this.#reading = false;
    clearTimeout(listing?.timer);
    clearTimeout(this.#readyTimer);
    listing?.resolve([]);
  }

  #finishListing(ids: string[]): void {
    const listing = this.#listing;
    if (!listing) return;
    const page = this.#page;
    this.#listing = undefined;
    clearTimeout(listing.timer);
    this.#send({ event: "stop" });
    listing.resolve(ids);
    // Let the caller's promise chain install the learned tracks before
    // the next turn makes the Player ready, or the old playlist could play.
    this.#readyTimer = setTimeout(() => {
      if (this.#page !== page || this.#listing) return;
      this.#reading = false;
      if (this.ready) this.#events?.ready();
    }, 0);
  }

  #send(message: SidecarMessage): void {
    this.#page?.send(JSON.stringify(message));
  }

  #receive(text: string): void {
    const message = parse(text);
    if (!message) return;

    switch (message.event) {
      case "playback":
        this.#events?.playback(message.songId, message.state, message.position);
        return;
      case "loaded":
        // A live stream's duration is how long it has been on, not its
        // length: it has none.
        this.#events?.loaded(
          message.songId,
          message.live ? undefined : Math.round(message.duration),
          message.title,
        );
        return;
      case "cued": {
        if (this.#reading && this.#listing?.requestId === message.requestId) {
          this.#finishListing(message.ids);
        }
        return;
      }
      case "ended":
        this.#leftAir(message.songId);
        this.#events?.ended(message.songId);
        return;
      case "error":
        this.#leftAir(message.songId);
        this.#events?.failed(message.songId);
        return;
    }
  }

  #leftAir(songId: string): void {
    if (this.#activeSongId !== songId) return;
    this.#activeSongId = undefined;
    this.#cueWhenIdle();
  }

  #tellConnection(): void {
    for (const listener of this.#connectionListeners) listener(this.connected);
  }
}

/** What a page sent, if it is one of our messages: it is JSON off a socket. */
function parse(text: string): PageMessage | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return isPageMessage(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

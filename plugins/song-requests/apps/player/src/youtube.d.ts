/**
 * The part of YouTube's IFrame Player API the page uses
 * (https://developers.google.com/youtube/iframe_api_reference).
 */
declare namespace YT {
  interface PlayerEvent {
    target: Player;
  }

  interface OnStateChangeEvent extends PlayerEvent {
    /** -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued. */
    data: number;
  }

  interface OnErrorEvent extends PlayerEvent {
    data: number;
  }

  interface PlayerOptions {
    width?: string | number;
    height?: string | number;
    playerVars?: Record<string, string | number>;
    events?: {
      onReady?: (event: PlayerEvent) => void;
      onStateChange?: (event: OnStateChangeEvent) => void;
      onError?: (event: OnErrorEvent) => void;
      /**
       * The browser blocked autoplay with sound (its policy, unlike OBS's);
       * the page asks for one click and then may play (spike #3).
       */
      onAutoplayBlocked?: () => void;
    };
  }

  /**
   * What `getVideoData()` gives — not in YouTube's reference, but the
   * player's own description of the video it holds.
   */
  interface VideoData {
    video_id?: string;
    /** Whether the video is a live stream. */
    isLive?: boolean;
    /** The title the player holds for the video. */
    title?: string;
  }

  class Player {
    constructor(element: string | HTMLElement, options: PlayerOptions);
    loadVideoById(videoId: string): void;
    loadVideoById(video: { videoId: string; startSeconds?: number }): void;
    cueVideoById(video: { videoId: string; startSeconds?: number }): void;
    /**
     * Cues a playlist without playing it — how the page lists the Fallback
     * Playlist for the sidecar (ADR-0003).
     */
    cuePlaylist(args: { list: string }): void;
    /** The ids of the playlist's entries the player has loaded. */
    getPlaylist(): string[];
    playVideo(): void;
    pauseVideo(): void;
    setVolume(volume: number): void;
    stopVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    mute(): void;
    unMute(): void;
    /**
     * In seconds; 0 until the video's data has loaded. For a live stream, how
     * long it has been on.
     */
    getDuration(): number;
    getCurrentTime(): number;
    getPlayerState(): number;
    getVideoData(): VideoData;
    destroy(): void;
  }
}

interface Window {
  onYouTubeIframeAPIReady?: () => void;
}

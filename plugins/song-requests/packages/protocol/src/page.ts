import { z } from "zod";

/**
 * The messages between the sidecar and the Player Page, over the page's own
 * WebSocket. The page does only what the sidecar says — load a video and
 * play it, unmute it, pause, resume, change volume or stop — and reports how that went; the Song Queue lives
 * in the sidecar.
 *
 * Every message is an object with an `event` discriminant, like the editor
 * messages, and both sides check what arrives: it is JSON off a socket.
 */

/**
 * The WebSocket close code a page is closed with when another page took over
 * (the one opened last plays). A page closed with it does not reconnect —
 * otherwise two open pages would take the player from each other for ever.
 */
export const REPLACED_CLOSE_CODE = 4000;

/**
 * The WebSocket close code a page is closed with when the streamer replaced
 * the Player Key: the address the page holds no longer works, so it stops
 * for good instead of reconnecting.
 */
export const KEY_CHANGED_CLOSE_CODE = 4001;

/** Observed playback; Pause and Play also update the Song Queue's pause state. */
export const PlayerPlaybackStateSchema = z.enum([
  "playing",
  "paused",
  "buffering",
  "loading",
]);
export type PlayerPlaybackState = z.infer<typeof PlayerPlaybackStateSchema>;

const SidecarMessageSchema = z.discriminatedUnion("event", [
  /**
   * `muted` for a Song at its Start Check, which is not heard until `unmute`.
   * `startAt` is seconds in to start at: the Current Song goes on from where a
   * restart found it, without a second Song Started (ADR-0002).
   */
  z.object({
    event: z.literal("load"),
    songId: z.string(),
    videoId: z.string(),
    muted: z.boolean(),
    startAt: z.number(),
    paused: z.boolean().optional(),
    volume: z.number().int().min(0).max(100).optional(),
  }),
  z.object({ event: z.literal("unmute"), songId: z.string() }),
  z.object({ event: z.literal("stop") }),
  z.object({ event: z.literal("pause") }),
  z.object({ event: z.literal("resume") }),
  z.object({
    event: z.literal("volume"),
    volume: z.number().int().min(0).max(100),
  }),
  /**
   * Cues a playlist — never to play it (the sidecar hands tracks one at a
   * time, ADR-0003), only so the page lists it back: the keyless way of
   * learning the Fallback Playlist's tracks. The request id keeps a late
   * reply to a timed-out cue from answering a later one.
   */
  z.object({
    event: z.literal("cue"),
    requestId: z.string(),
    playlistId: z.string(),
  }),
]);

const PageMessageSchema = z.discriminatedUnion("event", [
  /** The player's own controls and buffering change whether progress advances. */
  z.object({
    event: z.literal("playback"),
    songId: z.string(),
    state: PlayerPlaybackStateSchema,
    position: z.number().nonnegative(),
  }),
  /**
   * The video plays, and the player knows it: `duration` is the player's
   * own, in seconds, and `live` whether the video is a live stream — whose
   * "duration" is only how long it has been on. `title` is
   * `getVideoData()`'s — how a Fallback Track learned without the API Key
   * gets its title.
   */
  z.object({
    event: z.literal("loaded"),
    songId: z.string(),
    duration: z.number(),
    live: z.boolean(),
    title: z.string().optional(),
  }),
  z.object({ event: z.literal("ended"), songId: z.string() }),
  /** `code` is the IFrame Player's error code — 150 for any refusal at load. */
  z.object({
    event: z.literal("error"),
    songId: z.string(),
    code: z.number(),
  }),
  /**
   * The playlist a `cue` cued, as the player lists it. YouTube's player
   * loads a long playlist's entries in chunks, so this may not list them
   * all — the sidecar takes what it lists (ADR-0003).
   */
  z.object({
    event: z.literal("cued"),
    requestId: z.string(),
    ids: z.array(z.string()),
  }),
]);

/** A message the sidecar sends to the Player Page. */
export type SidecarMessage = z.infer<typeof SidecarMessageSchema>;

/** A message the Player Page sends to the sidecar. */
export type PageMessage = z.infer<typeof PageMessageSchema>;

export function isSidecarMessage(value: unknown): value is SidecarMessage {
  return SidecarMessageSchema.safeParse(value).success;
}

export function isPageMessage(value: unknown): value is PageMessage {
  return PageMessageSchema.safeParse(value).success;
}

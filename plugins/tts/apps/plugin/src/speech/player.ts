import type { Audio } from "./provider";

/** An output device a Player can play on. */
export type Device = {
  /** The OS's id for it, which persists across restarts and re-plugging. */
  id: string;
  /**
   * As the OS's sound settings name it. The host's Play Sound shows the same
   * on macOS, and may show a shorter name on Windows.
   */
  name: string;
  /** The OS's default output right now. */
  isDefault?: boolean;
};

/**
 * Where a play goes: `system-default`, whichever device is the OS's default
 * output when the sound starts, or one device by its id. `name` is the one
 * it was chosen under, for the reason when it is not here.
 */
export type OutputDevice = "system-default" | { id: string; name: string };

export type PlayOptions = {
  /** 0 to 1, no boost. The Player's, so it behaves the same for every Provider. */
  volume: number;
  device: OutputDevice;
  /** Called once, when the sound starts — not when `play` is called. */
  onStarted?: () => void;
};

/**
 * A Player plays a Provider's audio — one per OS. `play` settles when the
 * sound has ended. Aborting `signal` stops it at once and rejects with
 * `signal.reason`; an abort is not an error. A play that fails before its
 * sound starts never calls `onStarted`.
 *
 * A sound never moves to another device: the device decides who hears it. A
 * device that is not here fails the play as `device-missing`, and one that
 * goes away mid-play — or, on System default, stops being the default —
 * cuts it off with a failure.
 */
export interface Player {
  /** The devices it can play on, in the OS's order. */
  devices(): Promise<Device[]>;
  play(audio: Audio, options: PlayOptions, signal: AbortSignal): Promise<void>;
}

/**
 * Why a Player did not play to the end — the Provider's kinds, with the
 * output device in place of the Voice:
 * - `device-missing` — the output device is not here;
 * - `unavailable` — the Player cannot work until something outside changes;
 * - `transient` — trying again later may work.
 */
export type PlayerErrorKind = "device-missing" | "unavailable" | "transient";

const PLAYER_ERROR_KINDS: readonly string[] = [
  "device-missing",
  "unavailable",
  "transient",
] satisfies PlayerErrorKind[];

/** A Player's failure; `message` is the reason, readable by a person. */
export class PlayerError extends Error {
  constructor(
    readonly kind: PlayerErrorKind,
    reason: string,
  ) {
    super(reason);
    this.name = "PlayerError";
  }
}

export function isPlayerErrorKind(kind: string): kind is PlayerErrorKind {
  return PLAYER_ERROR_KINDS.includes(kind);
}

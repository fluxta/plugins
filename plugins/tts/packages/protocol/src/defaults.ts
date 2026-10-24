/** The Output Device that is whatever the OS plays on when a Phrase starts. */
export const SYSTEM_DEFAULT = "system-default";

/**
 * Where a Phrase plays: System default — whichever device is the OS's
 * default output when the Phrase starts — or one device, by the id the OS
 * keeps for it across restarts. A device is saved with its name, to show
 * while it is not here.
 */
export type OutputDevice = typeof SYSTEM_DEFAULT | { id: string; name: string };

/**
 * How the plugin speaks unless a Speak overrides it, as kept in Plugin
 * Settings. A fresh install has never saved any: it speaks with these
 * initial values without the Plugin Editor ever being opened.
 */
export type Defaults = {
  /**
   * The Default Voice's id. Absent until the user picks one: the Default
   * Voice is then the voice the OS speaks with.
   */
  voice?: string;
  /** A multiplier, 1 being the voice's normal pace. */
  rate: number;
  /** 0–100 %, no boost. */
  volume: number;
  device: OutputDevice;
  /** The most graphemes a Phrase keeps; `null` for no limit. */
  lengthLimit: number | null;
};

export const RATE_MIN = 0.5;
export const RATE_MAX = 2;

/** Every rate the editors offer: 0.5× to 2.0× in steps of 0.1. */
export const RATES: readonly number[] = Array.from(
  { length: Math.round((RATE_MAX - RATE_MIN) * 10) + 1 },
  (_, step) => (RATE_MIN * 10 + step) / 10,
);

export const VOLUME_MAX = 100;

export const INITIAL_DEFAULTS: Defaults = {
  rate: 1,
  volume: VOLUME_MAX,
  device: SYSTEM_DEFAULT,
  // About 12–15 s at the normal pace; a Twitch chat message runs to 500.
  lengthLimit: 200,
};

/** A rate as the editors show it: `1.0×`. */
export function formatRate(rate: number): string {
  return `${rate.toFixed(1)}×`;
}

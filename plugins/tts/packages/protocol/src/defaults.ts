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
 * A Preset as Speak and the Defaults refer to it: by its id, which a rename
 * keeps, with its name to show while it is not here — deleted, or another
 * computer's.
 */
export type PresetRef = { id: string; name: string };

/**
 * How the plugin speaks unless a Speak overrides it, as kept in Plugin
 * Settings. A fresh install has never saved any: it speaks with these
 * initial values without the Plugin Editor ever being opened.
 */
export type Defaults = {
  /**
   * The Default Preset. Absent until the user picks one: the plugin then
   * speaks with the voice the OS speaks with, at 1.0×.
   */
  preset?: PresetRef;
  /** 0–100 %, no boost. */
  volume: number;
  device: OutputDevice;
  /** The most graphemes a Phrase keeps; `null` for no limit. */
  lengthLimit: number | null;
};

export const VOLUME_MAX = 100;

export const INITIAL_DEFAULTS: Defaults = {
  volume: VOLUME_MAX,
  device: SYSTEM_DEFAULT,
  // About 12–15 s at the normal pace; a Twitch chat message runs to 500.
  lengthLimit: 200,
};

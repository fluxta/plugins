import type { ColorMode, FilterMode, MediaMode, VisibilityMode } from "./picker";

/**
 * Every Action's settings carry the Connection they act on. Optional because
 * an Action saved while exactly one Connection was configured stores no
 * explicit choice — the plugin fills in the sole Connection itself.
 */
type WithConnection = { connection?: string };

export type SetSceneSettings = WithConnection & {
  scene?: string;
};

export type StartStreamSettings = WithConnection;
export type StopStreamSettings = WithConnection;
export type StartRecordSettings = WithConnection;
export type StopRecordSettings = WithConnection;
export type PauseRecordSettings = WithConnection;
export type ResumeRecordSettings = WithConnection;

export type SetSourceVisibilitySettings = WithConnection & {
  scene?: string;
  source?: string;
  mode?: VisibilityMode;
};

export type MuteInputSettings = WithConnection & {
  input?: string;
};

export type UnmuteInputSettings = WithConnection & {
  input?: string;
};

export type SetInputVolumeSettings = WithConnection & {
  input?: string;
  /** 0–100 and up (OBS allows boosting past unity); matches the percentage
   * OBS's own mixer shows, converted to `inputVolumeMul` at the call site. */
  volumePercent?: number;
};

export type SetSourceFilterSettings = WithConnection & {
  /**
   * Which Scene to pick the Source from in the editor — a Filter belongs to
   * the Source itself, not to any Scene, so `onTrigger` never reads this. It
   * is saved only so reopening the editor can restore the Source picker's
   * cascade instead of resetting it.
   */
  scene?: string;
  source?: string;
  filter?: string;
  mode?: FilterMode;
};

/** A Filter attached directly to a Scene itself, not to a Source placed on it. */
export type SetSceneFilterSettings = WithConnection & {
  scene?: string;
  filter?: string;
  mode?: FilterMode;
};

export type SetMediaStateSettings = WithConnection & {
  input?: string;
  mode?: MediaMode;
};

/** Swaps the file a Media/Image Source plays, as opposed to controlling its playback. */
export type SetMediaSourceFileSettings = WithConnection & {
  input?: string;
  path?: string;
};

export type SetBrowserSourceUrlSettings = WithConnection & {
  input?: string;
  url?: string;
};

export type SetTextSourceSettings = WithConnection & {
  input?: string;
  text?: string;
};

export type SetColorSourceSettings = WithConnection & {
  input?: string;
  mode?: ColorMode;
  /** #RRGGBB — only read when `mode` is "fixed". */
  color?: string;
};

/** Shows/hides/toggles every Source inside a Group at once — not the Group's own placement. */
export type SetGroupSourcesVisibilitySettings = WithConnection & {
  group?: string;
  mode?: VisibilityMode;
};

export type TakeScreenshotSettings = WithConnection & {
  source?: string;
  /**
   * Full file path, including filename and extension — OBS writes exactly
   * this path. The image format is derived from the extension (see
   * `obs/screenshot.ts`'s `formatFromPath`) rather than asked for
   * separately, so the two can never disagree.
   */
  path?: string;
};

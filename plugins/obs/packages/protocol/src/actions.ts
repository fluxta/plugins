import type { FilterMode, VisibilityMode } from "./picker";

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

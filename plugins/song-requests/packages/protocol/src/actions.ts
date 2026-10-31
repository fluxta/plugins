import type { RequestSongOverrides } from "./rules";

/**
 * Request Song's settings, as its Action Editor saves them.
 *
 * Text settings are edited through `TemplateField`, so the host may
 * substitute a number or boolean. The sidecar reads them as templated values.
 */
export type RequestSongSettings = {
  request?: string;
  requesterPlatform?: string;
  requesterId?: string;
  requesterName?: string;
  reference?: string;
  /** Where to insert: the end (In turn) or the beginning (Next) of the Song Queue. */
  position?: "inTurn" | "next";
  /** Per Rule: follow the Default, a value of its own, or do not check. */
  overrides?: RequestSongOverrides;
};

export type { RequestSongOverrides, RuleOverride } from "./rules";

export type PlaybackSettings = { mode?: "pause" | "resume" | "toggle" };
export type VolumeSettings = { mode?: "set" | "change"; amount?: string };
export type SkipSettings = Record<string, never>;

export type RemoveSongSettings = {
  target?: "requesterLatest" | "requesterAll" | "position" | "songId";
  requesterPlatform?: string;
  requesterId?: string;
  position?: string;
  songId?: string;
};

export type ClearQueueSettings = Record<string, never>;

export type GetSongSettings = {
  target?: "current" | "position" | "requesterNext";
  position?: string;
  requesterPlatform?: string;
  requesterId?: string;
};

export type RequestsSettings = { mode?: "open" | "close" | "toggle" };

export type BlockSongSettings = {
  target?: "current" | "songId";
  songId?: string;
  kind?: "track" | "channel";
};

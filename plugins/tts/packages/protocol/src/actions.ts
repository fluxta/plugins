import type { OutputDevice } from "./defaults";

/**
 * Where Speak puts its Phrase in the Speech Queue: `in-turn` (the end, the
 * default), `next` (ahead of every In turn Phrase, behind other Next ones) or
 * `now` (cuts off the current Phrase and is spoken at once).
 */
export type Position = "in-turn" | "next" | "now";

/**
 * Speak's settings. `text` is what the Phrase says, `tags` what Stop Speech
 * can address it by. Both may hold `{{…}}` references, and Fluxta
 * interpolates them before the sidecar sees them — a lone reference keeps
 * its value's type, so what arrives can be a number or a boolean as well as
 * text.
 *
 * The rest override the Plugin Settings defaults; an absent one follows its
 * default. None of them takes a template.
 */
export type SpeakSettings = {
  text?: string;
  position?: Position;
  tags?: string[];
  /** A Voice's id. */
  voice?: string;
  /** A multiplier, 0.5–2. */
  rate?: number;
  /** 0–100 %. */
  volume?: number;
  device?: OutputDevice;
  /** The most graphemes the Phrase keeps. */
  lengthLimit?: number;
};

/**
 * Which Phrases Stop Speech ends: the current one (`current`, the default),
 * every one (`everything`), or every one carrying `tag` (`tag`).
 */
export type StopReach = "current" | "everything" | "tag";

/** Stop Speech's settings. `tag` may hold `{{…}}` references; it is read only for `tag`. */
export type StopSpeechSettings = {
  what?: StopReach;
  tag?: string;
};

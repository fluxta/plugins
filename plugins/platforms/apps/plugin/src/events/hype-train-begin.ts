/**
 * The Hype Train Begin Event Source.
 *
 * Built from Twitch's v2 Hype Train subscription — the v1 one it replaced
 * was withdrawn in January 2026. v2 also carries Shared Hype Train
 * participants and an all-time-high comparison, neither of which this Source
 * reports: Shared Chat sits outside this plugin's scope, and the all-time
 * comparison is Twitch trivia rather than something a Run reacts to.
 */
export const HYPE_TRAIN_BEGIN_EVENT = "twitch-hype-train-begin";

/** Every field declared for `twitch-hype-train-begin` in the manifest. */
export type HypeTrainBeginPayload = {
  hypeTrainId: string;
  /** The level the Hype Train started on — usually 1, higher after a Golden Kappa Train carryover. */
  level: number;
  total: number;
  /** Points contributed at the current level, out of `goal`. */
  progress: number;
  goal: number;
  /** Twitch's own kind: `regular`, `treasure`, or `golden_kappa`. */
  trainType: string;
};

/**
 * The parts of twurple's hype-train-begin (v2) event this mapping reads.
 *
 * Narrowed to an own type so the mapping can be exercised without a live
 * payload, which is the only thing twurple's event can be built from.
 */
export type HypeTrainBeginSource = {
  id: string;
  level: number;
  total: number;
  progress: number;
  goal: number;
  type: string;
};

export function toHypeTrainBeginPayload(event: HypeTrainBeginSource): HypeTrainBeginPayload {
  return {
    hypeTrainId: event.id,
    level: event.level,
    total: event.total,
    progress: event.progress,
    goal: event.goal,
    trainType: event.type,
  };
}

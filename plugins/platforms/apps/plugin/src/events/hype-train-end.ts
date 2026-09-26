/**
 * The Hype Train End Event Source.
 *
 * Built from Twitch's v2 Hype Train subscription — see `hype-train-begin.ts`
 * for why v2 and for what it deliberately leaves out.
 */
export const HYPE_TRAIN_END_EVENT = "twitch-hype-train-end";

/** Every field declared for `twitch-hype-train-end` in the manifest. */
export type HypeTrainEndPayload = {
  hypeTrainId: string;
  /** The level the Hype Train reached before ending. */
  level: number;
  total: number;
  /** Twitch's own kind: `regular`, `treasure`, or `golden_kappa`. */
  trainType: string;
};

/**
 * The parts of twurple's hype-train-end (v2) event this mapping reads.
 *
 * Narrowed to an own type so the mapping can be exercised without a live
 * payload, which is the only thing twurple's event can be built from.
 */
export type HypeTrainEndSource = {
  id: string;
  level: number;
  total: number;
  type: string;
};

export function toHypeTrainEndPayload(event: HypeTrainEndSource): HypeTrainEndPayload {
  return {
    hypeTrainId: event.id,
    level: event.level,
    total: event.total,
    trainType: event.type,
  };
}

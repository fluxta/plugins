import {
  outcomePointFields,
  outcomeTitleFields,
} from "./prediction-outcome-fields";

/**
 * The Prediction Lock Event Source.
 *
 * Platform-specific, unlike chat: YouTube and Kick have their own prediction
 * mechanics, if any, so a shared shape would be mostly guesswork.
 */
export const PREDICTION_LOCK_EVENT = "twitch-prediction-lock";

/** Every field declared for `twitch-prediction-lock` in the manifest. */
export type PredictionLockPayload = {
  predictionId: string;
  title: string;
  outcome1: string;
  outcome1Points: number;
  outcome2: string;
  outcome2Points: number;
  outcome3: string;
  outcome3Points: number;
  outcome4: string;
  outcome4Points: number;
  outcome5: string;
  outcome5Points: number;
  outcome6: string;
  outcome6Points: number;
  outcome7: string;
  outcome7Points: number;
  outcome8: string;
  outcome8Points: number;
  outcome9: string;
  outcome9Points: number;
  outcome10: string;
  outcome10Points: number;
};

/**
 * The parts of twurple's prediction-lock event this mapping reads.
 *
 * Narrowed to an own type so the mapping can be exercised without a live
 * payload, which is the only thing twurple's event can be built from.
 */
export type PredictionLockSource = {
  id: string;
  title: string;
  outcomes: { title: string; channelPoints: number }[];
};

export function toPredictionLockPayload(
  event: PredictionLockSource,
): PredictionLockPayload {
  return {
    predictionId: event.id,
    title: event.title,
    ...outcomeTitleFields(event.outcomes),
    ...outcomePointFields(event.outcomes),
  };
}

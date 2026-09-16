import { outcomeTitleFields } from "./prediction-outcome-fields";

/**
 * The Prediction Begin Event Source.
 *
 * Platform-specific, unlike chat: YouTube and Kick have their own prediction
 * mechanics, if any, so a shared shape would be mostly guesswork.
 */
export const PREDICTION_BEGIN_EVENT = "twitch-prediction-begin";

/** Every field declared for `twitch-prediction-begin` in the manifest. */
export type PredictionBeginPayload = {
  predictionId: string;
  title: string;
  outcome1: string;
  outcome2: string;
  outcome3: string;
  outcome4: string;
  outcome5: string;
  outcome6: string;
  outcome7: string;
  outcome8: string;
  outcome9: string;
  outcome10: string;
};

/**
 * The parts of twurple's prediction-begin event this mapping reads.
 *
 * Narrowed to an own type so the mapping can be exercised without a live
 * payload, which is the only thing twurple's event can be built from.
 */
export type PredictionBeginSource = {
  id: string;
  title: string;
  outcomes: { title: string }[];
};

export function toPredictionBeginPayload(
  event: PredictionBeginSource,
): PredictionBeginPayload {
  return {
    predictionId: event.id,
    title: event.title,
    ...outcomeTitleFields(event.outcomes),
  };
}

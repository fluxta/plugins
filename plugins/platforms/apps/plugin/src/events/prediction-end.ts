import { outcomePointFields, outcomeTitleFields } from "./prediction-outcome-fields";

/**
 * The Prediction End Event Source.
 *
 * Platform-specific, unlike chat: YouTube and Kick have their own prediction
 * mechanics, if any, so a shared shape would be mostly guesswork.
 *
 * Fires on both a resolution and a cancellation — Twitch reports both through
 * the same webhook, distinguished only by `status` — so this one Event
 * Source covers what Resolve Prediction and Cancel Prediction each did.
 */
export const PREDICTION_END_EVENT = "twitch-prediction-end";

/** Every field declared for `twitch-prediction-end` in the manifest. */
export type PredictionEndPayload = {
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
  /** The winning Outcome's title — empty when the prediction was canceled. */
  winner: string;
  /** Twitch's own status text: `resolved` or `canceled`. */
  status: string;
};

/**
 * The parts of twurple's prediction-end event this mapping reads.
 *
 * Narrowed to an own type so the mapping can be exercised without a live
 * payload, which is the only thing twurple's event can be built from.
 */
export type PredictionEndSource = {
  id: string;
  title: string;
  outcomes: { title: string; channelPoints: number }[];
  status: string;
  /** The winning Outcome, as Twitch already resolved it — null when canceled. */
  winningOutcome: { title: string } | null;
};

export function toPredictionEndPayload(event: PredictionEndSource): PredictionEndPayload {
  return {
    predictionId: event.id,
    title: event.title,
    ...outcomeTitleFields(event.outcomes),
    ...outcomePointFields(event.outcomes),
    winner: event.winningOutcome?.title ?? "",
    status: event.status,
  };
}

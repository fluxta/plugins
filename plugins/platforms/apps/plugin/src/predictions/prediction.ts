import type { HelixCreatePredictionData } from "@twurple/api";

/** A Prediction ready to send to Twitch, already validated by the Action. */
export type PredictionDraft = {
  title: string;
  /** Twitch requires between two and ten. */
  outcomes: string[];
  /** Seconds betting stays open for. Twitch's range is 30–1800. */
  duration: number;
};

/**
 * The parts of twurple's `HelixPrediction` this service reads.
 *
 * Narrowed to an own type so the service can be exercised without a live
 * prediction, which is the only thing twurple's class can be built from.
 *
 * Outcomes carry their id here, unlike a Poll's Choices: Resolve Prediction
 * has to tell Twitch which Outcome won, and Twitch only accepts that by id.
 * The id never leaves this service — the Action addresses an Outcome by
 * position or title, and the service resolves that to the id Twitch wants.
 */
export type PredictionSource = {
  id: string;
  title: string;
  status: string;
  outcomes: { id: string; title: string }[];
};

/** What twurple's `createPrediction` call takes, built from a draft. */
export function toCreatePredictionData(draft: PredictionDraft): HelixCreatePredictionData {
  return {
    title: draft.title,
    outcomes: draft.outcomes,
    autoLockAfter: draft.duration,
  };
}

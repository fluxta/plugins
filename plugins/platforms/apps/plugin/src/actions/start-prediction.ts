import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import {
  PREDICTION_DURATION_MAX,
  PREDICTION_DURATION_MIN,
  PREDICTION_MAX_OUTCOMES,
  PREDICTION_MIN_OUTCOMES,
  type StartPredictionSettings,
} from "platforms-protocol";

import type { PredictionsService } from "../predictions/service";

export const START_PREDICTION_ACTION = "twitch-start-prediction";

/**
 * Starts a Prediction on the Channel.
 *
 * Standalone: it acts on the channel, not on the deck Item that triggered it.
 *
 * Produces the started Prediction's id as a Run Variable — not because a
 * later step needs to address it (Twitch allows only one running Prediction,
 * so Lock, Resolve and Cancel each need no target of their own), but so a
 * program that wants to log or relay it still can.
 */
export class StartPredictionAction extends StandaloneAction<StartPredictionSettings> {
  type = START_PREDICTION_ACTION;

  constructor(private readonly predictions: PredictionsService) {
    super();
  }

  // Always resolves to an object — even an empty one on the paths that never
  // reach Twitch. The SDK's declared return type is a union of whole Promise
  // types (`Promise<void> | Promise<Record<...>>`), which `Promise<Record<...>
  // | undefined>` does not match even though it means the same thing.
  onTrigger = async (
    ctx: StandaloneTriggerContext<StartPredictionSettings>,
  ): Promise<Record<string, string>> => {
    const title = ctx.settings.title?.trim();

    if (!title) {
      console.warn("Start Prediction ran with no title configured");
      return {};
    }

    const outcomes = readOutcomes(ctx.settings.outcomes);

    if (!outcomes) {
      return {};
    }

    const duration = readDuration(ctx.settings.duration);

    if (duration === undefined) {
      return {};
    }

    const predictionId = await this.predictions.start({ title, outcomes, duration });
    return predictionId ? { predictionId } : {};
  };
}

/** The Outcomes the settings ask for, or nothing when Twitch would refuse them. */
function readOutcomes(outcomes: string[] | undefined): string[] | undefined {
  const trimmed = (outcomes ?? [])
    .map((outcome) => outcome.trim())
    .filter((outcome) => outcome.length > 0);

  if (trimmed.length < PREDICTION_MIN_OUTCOMES) {
    console.warn(
      `Start Prediction needs at least ${PREDICTION_MIN_OUTCOMES} outcomes; it had ${trimmed.length}`,
    );
    return undefined;
  }

  if (trimmed.length > PREDICTION_MAX_OUTCOMES) {
    console.warn(
      `Start Prediction allows at most ${PREDICTION_MAX_OUTCOMES} outcomes; the rest were dropped`,
    );
    return trimmed.slice(0, PREDICTION_MAX_OUTCOMES);
  }

  return trimmed;
}

/**
 * The duration the settings ask for, in seconds.
 *
 * The field carries a template, so what arrives here is whatever the
 * reference resolved to — a number typed by hand, or something a run
 * variable produced.
 */
function readDuration(value: string | undefined): number | undefined {
  const text = value?.trim();

  if (!text) {
    console.warn("Start Prediction ran with no duration configured");
    return undefined;
  }

  const duration = Number(text);

  if (
    !Number.isInteger(duration) ||
    duration < PREDICTION_DURATION_MIN ||
    duration > PREDICTION_DURATION_MAX
  ) {
    console.warn(
      `Start Prediction ignored the duration "${text}": Twitch keeps betting open between ` +
        `${PREDICTION_DURATION_MIN} and ${PREDICTION_DURATION_MAX} seconds`,
    );
    return undefined;
  }

  return duration;
}

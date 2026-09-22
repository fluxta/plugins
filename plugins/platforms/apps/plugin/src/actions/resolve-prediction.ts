import { StandaloneAction, type StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { ResolvePredictionSettings } from "platforms-protocol";

import type { PredictionsService } from "../predictions/service";

export const RESOLVE_PREDICTION_ACTION = "twitch-resolve-prediction";

/**
 * Resolves the Channel's running Prediction in favour of one Outcome.
 *
 * The winning Outcome is named by its position or its title, never by
 * Twitch's id — the plugin looks the id up itself from the running
 * Prediction's own Outcomes, the same "current object, addressed by number or
 * name" mechanic Polls already established. Typing a Twitch UUID through a
 * template is not a scenario a deck button can support.
 *
 * Standalone: it acts on the channel, not on the deck Item that triggered it.
 */
export class ResolvePredictionAction extends StandaloneAction<ResolvePredictionSettings> {
  type = RESOLVE_PREDICTION_ACTION;

  constructor(private readonly predictions: PredictionsService) {
    super();
  }

  onTrigger = async (ctx: StandaloneTriggerContext<ResolvePredictionSettings>): Promise<void> => {
    const outcome = ctx.settings.outcome?.trim();

    if (!outcome) {
      console.warn("Resolve Prediction ran with no winning outcome configured");
      return;
    }

    await this.predictions.resolve(outcome);
  };
}

import { StandaloneAction } from "@fluxta/sdk/api";

import type { PredictionsService } from "../predictions/service";

export const CANCEL_PREDICTION_ACTION = "twitch-cancel-prediction";

/**
 * Cancels the Channel's running Prediction, refunding every bet.
 *
 * Takes no settings: Twitch allows at most one running Prediction per
 * Channel, so there is nothing to pick — the plugin asks Twitch which one is
 * running and cancels that one. Running with none active does nothing beyond
 * a log line.
 *
 * Standalone: it acts on the channel, not on the deck Item that triggered it.
 */
export class CancelPredictionAction extends StandaloneAction {
  type = CANCEL_PREDICTION_ACTION;

  constructor(private readonly predictions: PredictionsService) {
    super();
  }

  onTrigger = async (): Promise<void> => {
    await this.predictions.cancel();
  };
}

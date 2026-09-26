import { StandaloneAction } from "@fluxta/sdk/api";

import type { PredictionsService } from "../predictions/service";

export const LOCK_PREDICTION_ACTION = "twitch-lock-prediction";

/**
 * Closes betting on the Channel's running Prediction.
 *
 * Takes no settings: Twitch allows at most one running Prediction per
 * Channel, so there is nothing to pick — the plugin asks Twitch which one is
 * running and locks that one. Running with none active does nothing beyond a
 * log line.
 *
 * Standalone: it acts on the channel, not on the deck Item that triggered it.
 */
export class LockPredictionAction extends StandaloneAction {
  type = LOCK_PREDICTION_ACTION;

  constructor(private readonly predictions: PredictionsService) {
    super();
  }

  onTrigger = async (): Promise<void> => {
    await this.predictions.lock();
  };
}

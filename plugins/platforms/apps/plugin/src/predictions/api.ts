import type { HelixCreatePredictionData } from "@twurple/api";

import type { PredictionSource } from "./prediction";

/**
 * The parts of twurple's predictions API the plugin uses.
 *
 * Narrowed to an own type so everything built on it can be exercised without
 * a live `ApiClient`, which only a connected Account can produce. twurple's
 * own Predictions satisfy `PredictionSource`, so the real client fits without
 * an adapter.
 */
export interface PredictionsApi {
  getPredictions(broadcaster: string): Promise<{ data: PredictionSource[] }>;
  createPrediction(
    broadcaster: string,
    data: HelixCreatePredictionData,
  ): Promise<PredictionSource>;
  lockPrediction(broadcaster: string, id: string): Promise<PredictionSource>;
  resolvePrediction(broadcaster: string, id: string, outcomeId: string): Promise<PredictionSource>;
  cancelPrediction(broadcaster: string, id: string): Promise<PredictionSource>;
}

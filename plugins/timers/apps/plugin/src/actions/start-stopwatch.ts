import {
  StandaloneAction,
  type StandaloneTriggerContext,
} from "@fluxta/sdk/api";
import type { StopwatchActionSettings } from "timers-protocol";

import type { Stopwatches } from "../stopwatches/stopwatches";
import { warnNoStopwatch } from "./no-stopwatch";

export const START_STOPWATCH_ACTION = "start-stopwatch";

/**
 * Starts an idle Stopwatch, resumes a paused one, and leaves a running one
 * as it is — so a scenario can start it on every "on air" without asking
 * first. Produces nothing: the time is read by the other three.
 */
export class StartStopwatchAction extends StandaloneAction<StopwatchActionSettings> {
  type = START_STOPWATCH_ACTION;

  constructor(private readonly stopwatches: Stopwatches) {
    super();
  }

  onTrigger = async (
    ctx: StandaloneTriggerContext<StopwatchActionSettings>,
  ): Promise<void> => {
    if (!(await this.stopwatches.start(ctx.settings.stopwatch))) {
      warnNoStopwatch("Start Stopwatch", ctx.settings.stopwatch);
    }
  };
}

import {
  StandaloneAction,
  type StandaloneTriggerContext,
} from "@fluxta/sdk/api";
import type { ElapsedSnapshot, StopwatchActionSettings } from "timers-protocol";

import type { Stopwatches } from "../stopwatches/stopwatches";
import { warnNoStopwatch } from "./no-stopwatch";

export const PAUSE_STOPWATCH_ACTION = "pause-stopwatch";

/**
 * Stops a running Stopwatch counting and produces the time it has counted.
 * An idle or paused one is left as it is, and its time is produced all the
 * same.
 */
export class PauseStopwatchAction extends StandaloneAction<StopwatchActionSettings> {
  type = PAUSE_STOPWATCH_ACTION;

  constructor(private readonly stopwatches: Stopwatches) {
    super();
  }

  onTrigger = async (
    ctx: StandaloneTriggerContext<StopwatchActionSettings>,
  ): Promise<ElapsedSnapshot | Record<string, never>> => {
    const snapshot = await this.stopwatches.pause(ctx.settings.stopwatch);

    if (!snapshot) {
      warnNoStopwatch("Pause Stopwatch", ctx.settings.stopwatch);
      return {};
    }

    return snapshot;
  };
}

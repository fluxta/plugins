import {
  StandaloneAction,
  type StandaloneTriggerContext,
} from "@fluxta/sdk/api";
import type { ElapsedSnapshot, StopwatchActionSettings } from "timers-protocol";

import type { Stopwatches } from "../stopwatches/stopwatches";
import { warnNoStopwatch } from "./no-stopwatch";

export const READ_STOPWATCH_ACTION = "read-stopwatch";

/**
 * Produces the time a Stopwatch has counted so far, changing nothing.
 */
export class ReadStopwatchAction extends StandaloneAction<StopwatchActionSettings> {
  type = READ_STOPWATCH_ACTION;

  constructor(private readonly stopwatches: Stopwatches) {
    super();
  }

  onTrigger = async (
    ctx: StandaloneTriggerContext<StopwatchActionSettings>,
  ): Promise<ElapsedSnapshot | Record<string, never>> => {
    const snapshot = await this.stopwatches.read(ctx.settings.stopwatch);

    if (!snapshot) {
      warnNoStopwatch("Read Stopwatch", ctx.settings.stopwatch);
      return {};
    }

    return snapshot;
  };
}

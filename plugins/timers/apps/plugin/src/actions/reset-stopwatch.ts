import {
  StandaloneAction,
  type StandaloneTriggerContext,
} from "@fluxta/sdk/api";
import type { ElapsedSnapshot, StopwatchActionSettings } from "timers-protocol";

import type { Stopwatches } from "../stopwatches/stopwatches";
import { warnNoStopwatch } from "./no-stopwatch";

export const RESET_STOPWATCH_ACTION = "reset-stopwatch";

/**
 * Puts a Stopwatch back to idle and produces the time it had counted
 * *before* the reset — so one step closes a session and hands on how long it
 * lasted.
 */
export class ResetStopwatchAction extends StandaloneAction<StopwatchActionSettings> {
  type = RESET_STOPWATCH_ACTION;

  constructor(private readonly stopwatches: Stopwatches) {
    super();
  }

  onTrigger = async (
    ctx: StandaloneTriggerContext<StopwatchActionSettings>,
  ): Promise<ElapsedSnapshot | Record<string, never>> => {
    const snapshot = await this.stopwatches.reset(ctx.settings.stopwatch);

    if (!snapshot) {
      warnNoStopwatch("Reset Stopwatch", ctx.settings.stopwatch);
      return {};
    }

    return snapshot;
  };
}

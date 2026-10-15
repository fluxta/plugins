import {
  StandaloneAction,
  type StandaloneTriggerContext,
} from "@fluxta/sdk/api";
import type { TimerActionSettings } from "timers-protocol";

import type { Timers } from "../timers/timers";
import { warnNoTimer } from "./no-timer";

export const CANCEL_TIMER_ACTION = "cancel-timer";

/**
 * Stops a Timer's countdown before it runs out, so it does not fire. An
 * idle Timer is left as it is — a scenario can cancel without asking first.
 */
export class CancelTimerAction extends StandaloneAction<TimerActionSettings> {
  type = CANCEL_TIMER_ACTION;

  constructor(private readonly timers: Timers) {
    super();
  }

  onTrigger = async (
    ctx: StandaloneTriggerContext<TimerActionSettings>,
  ): Promise<void> => {
    if (!(await this.timers.cancel(ctx.settings.timer))) {
      warnNoTimer("Cancel Timer", ctx.settings.timer);
    }
  };
}

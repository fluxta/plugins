import {
  StandaloneAction,
  type StandaloneTriggerContext,
} from "@fluxta/sdk/api";
import { parseDuration, type AddTimeSettings } from "timers-protocol";

import type { Timers } from "../timers/timers";
import { warnNoTimer } from "./no-timer";

export const ADD_TIME_ACTION = "add-time";

/**
 * Moves a running Timer's Due Time later by the step's amount. An idle Timer
 * has no countdown to extend and is left idle.
 */
export class AddTimeAction extends StandaloneAction<AddTimeSettings> {
  type = ADD_TIME_ACTION;

  constructor(private readonly timers: Timers) {
    super();
  }

  onTrigger = async (
    ctx: StandaloneTriggerContext<AddTimeSettings>,
  ): Promise<void> => {
    const { timer, amount } = ctx.settings;
    const ms = parseDuration(amount);

    if (ms === undefined) {
      console.warn(
        `Add Time did nothing: ${JSON.stringify(amount ?? "")} is not an amount of time`,
      );
      return;
    }

    if (!(await this.timers.addTime(timer, ms))) {
      warnNoTimer("Add Time", timer);
    }
  };
}

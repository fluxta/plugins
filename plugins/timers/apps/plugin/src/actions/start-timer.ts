import {
  StandaloneAction,
  type StandaloneTriggerContext,
} from "@fluxta/sdk/api";
import { parseDuration, type StartTimerSettings } from "timers-protocol";

import type { Timers } from "../timers/timers";
import { warnNoTimer } from "./no-timer";

export const START_TIMER_ACTION = "start-timer";

/**
 * Starts a Timer counting down — for the duration the step gives, or the
 * Timer's own. A running Timer counts down again from the start, or is left
 * as it is, as its Repeated Start says. Produces nothing: the Timer
 * announces itself with `timer-elapsed`.
 */
export class StartTimerAction extends StandaloneAction<StartTimerSettings> {
  type = START_TIMER_ACTION;

  constructor(private readonly timers: Timers) {
    super();
  }

  onTrigger = async (
    ctx: StandaloneTriggerContext<StartTimerSettings>,
  ): Promise<void> => {
    const { timer, duration } = ctx.settings;

    if (!(await this.timers.start(timer, durationOverride(duration)))) {
      warnNoTimer("Start Timer", timer);
    }
  };
}

/**
 * The step's own duration, or `undefined` for the Timer's. A value that is
 * not a duration — a `{{…}}` reference that came out as text, say — still
 * starts the Timer, for its own duration: in a scenario waiting for the
 * Timer to fire, a countdown of the usual length does less harm than none.
 */
function durationOverride(value: unknown): number | undefined {
  if (value === undefined || (typeof value === "string" && !value.trim())) {
    return undefined;
  }

  const ms = parseDuration(value);

  if (ms === undefined) {
    console.warn(
      `Start Timer counted the Timer's own duration: ${JSON.stringify(value)} is not a duration`,
    );
  }

  return ms;
}

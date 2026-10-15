import type { Source, SourceContext } from "@fluxta/sdk/api";

import type { Timers } from "../timers/timers";
import { stringArg } from "./args";

export const TIMER_STATE_SOURCE = "timerState";

/**
 * Pull Query Source: whether the Timer named by the `timer` param is `idle`
 * or `running`. Absent for a Timer that no longer exists, so a condition on
 * it takes its `else` branch.
 */
export function createTimerStateSource(timers: Timers): Source {
  return {
    key: TIMER_STATE_SOURCE,
    resolve: async (ctx: SourceContext) =>
      (await timers.state(stringArg(ctx.args, "timer"))) ?? null,
  };
}

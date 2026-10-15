import type { Source, SourceContext } from "@fluxta/sdk/api";

import type { Timers } from "../timers/timers";
import { stringArg } from "./args";

export const REMAINING_SECONDS_SOURCE = "remainingSeconds";

/**
 * Pull Query Source: how many seconds the Timer named by the `timer` param
 * has left, rounded up — a countdown reads 1 until it fires, never 0 while
 * still running. Absent for an idle Timer, which has no countdown, and for
 * one that no longer exists: either way a condition on it takes its `else`
 * branch.
 */
export function createRemainingSecondsSource(timers: Timers): Source {
  return {
    key: REMAINING_SECONDS_SOURCE,
    resolve: async (ctx: SourceContext) => {
      const ms = await timers.remainingMs(stringArg(ctx.args, "timer"));
      return ms === undefined ? null : Math.ceil(ms / 1000);
    },
  };
}

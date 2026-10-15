import type { Source, SourceContext } from "@fluxta/sdk/api";

import type { Stopwatches } from "../stopwatches/stopwatches";
import { stringArg } from "./args";

export const STOPWATCH_STATE_SOURCE = "stopwatchState";

/**
 * Pull Query Source: whether the Stopwatch named by the `stopwatch` param is
 * `idle`, `running` or `paused`. Absent for a Stopwatch that no longer
 * exists, so a condition on it takes its `else` branch.
 */
export function createStopwatchStateSource(stopwatches: Stopwatches): Source {
  return {
    key: STOPWATCH_STATE_SOURCE,
    resolve: async (ctx: SourceContext) =>
      (await stopwatches.state(stringArg(ctx.args, "stopwatch"))) ?? null,
  };
}

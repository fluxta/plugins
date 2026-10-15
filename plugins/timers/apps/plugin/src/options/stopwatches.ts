import type { Options } from "@fluxta/sdk/api";

import type { SettingsStore } from "../store";

export const STOPWATCHES_OPTIONS = "stopwatches";

/** The configured Stopwatches, for the `stopwatch` param of `stopwatchState`. */
export function createStopwatchesOptions(store: SettingsStore): Options {
  return {
    key: STOPWATCHES_OPTIONS,
    resolve: async () => {
      await store.loaded;
      return store
        .stopwatches()
        .map((stopwatch) => ({ value: stopwatch.id, label: stopwatch.name }));
    },
  };
}

import type { Options } from "@fluxta/sdk/api";

import type { SettingsStore } from "../store";

export const TIMERS_OPTIONS = "timers";

/**
 * The configured Timers, for the `timer` param of `timerState` and
 * `remainingSeconds`, and for filtering `timer-elapsed` on its `timer` field.
 */
export function createTimersOptions(store: SettingsStore): Options {
  return {
    key: TIMERS_OPTIONS,
    resolve: async () => {
      await store.loaded;
      return store.timers().map((timer) => ({
        value: timer.id,
        label: timer.name,
      }));
    },
  };
}

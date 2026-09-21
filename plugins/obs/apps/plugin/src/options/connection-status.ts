import type { Options, OptionsContext } from "@fluxta/sdk/api";

export const CONNECTION_STATUS_OPTIONS = "connection-status";

/** The fixed set `ConnectionStatus["status"]` can be — see `obs-protocol`'s `connection.ts`. */
const STATUSES = [
  { value: "connecting", label: "Connecting" },
  { value: "connected", label: "Connected" },
  { value: "error", label: "Error" },
];

/**
 * Backs `status` on `connection-status-changed`. Unlike every other Options
 * provider here, this one needs no live OBS query — the three values are
 * fixed by the type itself, so it just returns them.
 */
export function createConnectionStatusOptions(): Options {
  return {
    key: CONNECTION_STATUS_OPTIONS,
    resolve: (_ctx: OptionsContext) => STATUSES,
  };
}

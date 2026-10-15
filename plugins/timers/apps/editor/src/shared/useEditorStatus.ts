import { usePluginData } from "@fluxta/sdk/ui";
import type { PluginStatus } from "timers-protocol";

/**
 * The Timers and Stopwatches as the sidecar last saw them — every Action Editor reads
 * them the same way. `undefined` until the sidecar has answered.
 */
export function useEditorStatus(): PluginStatus | undefined {
  return usePluginData<PluginStatus>({ event: "get-status" }, "status").data;
}

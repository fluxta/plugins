import { usePluginData } from "@fluxta/sdk/ui";
import type { ConnectionEntry, PluginStatus } from "obs-protocol";

/**
 * The configured Connections, as the sidecar last saw them — every Action
 * editor reads this the same way.
 */
export function useEditorConnections(): ConnectionEntry[] {
  const { data } = usePluginData<PluginStatus>({ event: "get-status" }, "status");

  return data?.connections ?? [];
}

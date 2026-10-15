import { usePluginData } from "@fluxta/sdk/ui";
import type { ChatEntry, PluginStatus } from "telegram-protocol";

/**
 * The configured Chats, as the sidecar last saw them — every Action Editor
 * reads this the same way.
 */
export function useEditorChats(): ChatEntry[] {
  const { data } = usePluginData<PluginStatus>(
    { event: "get-status" },
    "status",
  );

  return data?.chats ?? [];
}

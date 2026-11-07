import { usePluginData } from "@fluxta/sdk/ui";
import { pluginMessageSchema, type Snapshot } from "wave-link-protocol";

export function useStatus() {
  return usePluginData<Snapshot>({ event: "get-status" }, (message) => {
    const parsed = pluginMessageSchema.safeParse(message);
    return parsed.success ? parsed.data.status : undefined;
  });
}

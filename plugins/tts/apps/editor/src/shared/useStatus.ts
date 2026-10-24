import { usePluginData } from "@fluxta/sdk/ui";
import type { EditorMessage, PluginStatus } from "tts-protocol";

const GET_STATUS = { event: "get-status" } satisfies EditorMessage;

/**
 * The defaults and the voices, as the sidecar tells every open editor —
 * and again whenever the defaults change. `undefined` until it has answered.
 */
export function useStatus(): PluginStatus | undefined {
  return usePluginData<PluginStatus>(GET_STATUS, "status").data;
}
